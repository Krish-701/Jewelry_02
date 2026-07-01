import { buildJewelryPromptV2, getGenerationSummary } from './prompt-builder.js';
import { fitPromptForMagnific, MAGNIFIC_MAX_PROMPT_LENGTH } from './prompt-limiter.js';
import { saveReferenceImage } from './storage.js';
import { optimizeImagesForAnalysis } from './image-optimizer.js';

const NEURALWATT_MAX_RETRIES = 3;
const NEURALWATT_TIMEOUT_MS = 120_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNeuralwattError(status, body = '') {
    const trimmed = (body || '').trim();
    const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');

    if (status === 504 || status === 408) {
        return new Error(
            'NeuralWatt analysis timed out. Try again with 1–2 smaller photos, or wait a minute and retry.'
        );
    }
    if (status === 429) {
        return new Error('NeuralWatt is busy (rate limit). Please wait 30 seconds and try again.');
    }
    if (isHtml) {
        const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
        const summary = titleMatch ? titleMatch[1].trim() : `Gateway error ${status}`;
        return new Error(`NeuralWatt error (${status}): ${summary}`);
    }

    const short = trimmed.slice(0, 280);
    return new Error(`NeuralWatt error (${status})${short ? `: ${short}` : ''}`);
}

function isTimeoutLikeError(err) {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('timed out')
        || msg.includes('timeout')
        || msg.includes('(504)')
        || msg.includes('(408)')
        || err?.name === 'AbortError';
}

/**
 * AI Provider — NeuralWatt (LLM analysis) + Freepik/Magnific API (image generation)
 *
 * OUTPUT SIZES:
 *   portrait   → 3:4 (portrait model shots)
 *   square2k   → 2048×2048 / 1:1
 *   landscape  → 1920×1080 / 16:9
 */

const JEWELRY_ANALYSIS_PROMPT = (imageCount) =>
    `You are an expert jewelry analyst. You are given ${imageCount} image${imageCount > 1 ? 's' : ''} of the SAME jewelry piece or SET from ${imageCount > 1 ? 'multiple angles and distances' : 'one angle'}. Analyze ALL images together as a single reference. Return a JSON object with these fields:
- type: jewelry type (e.g., "necklace", "earrings", "ring", "bracelet", "maang tikka", "set")
- pieces: array of {type, description, sizeHint, sizeUnit, estimatedSize} for EACH distinct piece visible in the images. estimatedSize is your best estimate of real-world size from the photo (e.g., "1.8cm inner diameter", "45cm chain length", "India size 16"). Only list pieces actually shown — if only a ring, list only ring; if ring+earrings+chain, list all three.
- estimatedSize: overall estimated size if single piece (when pieces array empty)
- style: overall style (e.g., "traditional", "modern", "vintage", "temple jewelry", "kundan", "polki")
- material: primary material (e.g., "22k gold", "silver", "rose gold", "platinum")
- stones: array of ALL stones/gems visible
- colors: array of dominant colors
- occasion: suitable occasion
- description: a 2-3 sentence description covering ALL angles and details shown
- weight_estimate: light/medium/heavy
- finish: surface finish (e.g., "matte", "polished", "antique", "oxidized")

Return ONLY valid JSON, no markdown.`;

const SIZE_MAP = {
    portrait:   { aspectRatio: '3:4',   label: 'Portrait 3:4', maxSize: 2048 },
    square2k:   { aspectRatio: '1:1',   label: '2048×2048 Square', maxSize: 2048 },
    landscape:  { aspectRatio: '16:9',  label: '1920×1080 Landscape', maxSize: 1920 },
    portrait4k: { aspectRatio: '3:4',   label: 'Portrait 4K (3072×4096)', maxSize: 4096 },
    square4k:   { aspectRatio: '1:1',   label: '4096×4096 Square', maxSize: 4096 },
    ultrawide4k:{ aspectRatio: '21:9',  label: 'Ultrawide 21:9', maxSize: 4096 },
    auto:       { aspectRatio: 'Auto',  label: 'Match Input', maxSize: 4096 },
};

const NANO_BANANA_ASPECT = {
    portrait:    '3:4',
    square2k:    '1:1',
    landscape:   '16:9',
    portrait4k:  '3:4',
    square4k:    '1:1',
    ultrawide4k: '21:9',
    auto:        '3:4',
};

const NANO_BANANA_RESOLUTION = {
    portrait:    '2K',
    square2k:    '2K',
    landscape:   '2K',
    portrait4k:  '4K',
    square4k:    '4K',
    ultrawide4k: '4K',
    auto:        '2K',
};

function getConfig() {
    return {
        neuralwattKey: process.env.NEURALWATT_API_KEY || '',
        neuralwattBase: process.env.NEURALWATT_BASE_URL || 'https://api.neuralwatt.com/v1',
        neuralwattModel: process.env.NEURALWATT_MODEL || 'kimi-k2.6',
        freepikKey: process.env.FREEPIK_API_KEY || '',
        freepikBase: process.env.FREEPIK_BASE_URL || 'https://api.magnific.com',
        imageModel: process.env.FREEPIK_IMAGE_MODEL || 'nano-banana-pro-flash',
    };
}

function resolveAspectRatio(outputSize) {
    return NANO_BANANA_ASPECT[outputSize] || NANO_BANANA_ASPECT.portrait;
}

function resolveResolution(outputSize) {
    return NANO_BANANA_RESOLUTION[outputSize] || NANO_BANANA_RESOLUTION.portrait;
}

function parseAnalysisJson(text) {
    try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        return {
            description: text, type: 'jewelry', style: 'traditional',
            material: 'gold', stones: [], colors: [], occasion: 'any',
            weight_estimate: 'medium', pieces: [], finish: 'polished',
        };
    }
}

// ============ NEURALWATT (LLM) ============

async function neuralwattChat(messages, options = {}) {
    const config = getConfig();
    if (!config.neuralwattKey) {
        throw new Error('NEURALWATT_API_KEY is not configured');
    }

    const timeoutMs = options.timeoutMs ?? NEURALWATT_TIMEOUT_MS;
    let lastError = null;

    for (let attempt = 0; attempt <= NEURALWATT_MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(`${config.neuralwattBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.neuralwattKey}`,
                },
                body: JSON.stringify({
                    model: config.neuralwattModel,
                    messages,
                    max_tokens: options.max_tokens ?? 1536,
                    temperature: options.temperature ?? 0.7,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errText = await response.text();
                const err = formatNeuralwattError(response.status, errText);
                lastError = err;

                if (RETRYABLE_STATUS.has(response.status) && attempt < NEURALWATT_MAX_RETRIES) {
                    const delay = 2000 * (attempt + 1);
                    console.warn(`NeuralWatt ${response.status}, retry ${attempt + 1}/${NEURALWATT_MAX_RETRIES} in ${delay}ms`);
                    await sleep(delay);
                    continue;
                }
                throw err;
            }

            const result = await response.json();
            return result.choices?.[0]?.message?.content || '';
        } catch (err) {
            lastError = err;
            const retryable = err.name === 'AbortError' || isTimeoutLikeError(err);

            if (retryable && attempt < NEURALWATT_MAX_RETRIES) {
                const delay = 2000 * (attempt + 1);
                console.warn(`NeuralWatt request failed (${err.name || 'error'}), retry ${attempt + 1}/${NEURALWATT_MAX_RETRIES} in ${delay}ms`);
                await sleep(delay);
                continue;
            }

            if (err.name === 'AbortError') {
                throw formatNeuralwattError(408, 'request aborted due to timeout');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError || new Error('NeuralWatt request failed after retries');
}

async function runNeuralwattAnalysis(images) {
    const imageCount = images.length;
    const content = [
        { type: 'text', text: JEWELRY_ANALYSIS_PROMPT(imageCount) },
    ];

    for (const img of images) {
        content.push({
            type: 'image_url',
            image_url: {
                url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`,
            },
        });
    }

    const text = await neuralwattChat([
        { role: 'user', content },
    ], { temperature: 0.3, max_tokens: 1536 });

    return parseAnalysisJson(text);
}

async function neuralwattAnalyze(images) {
    const optimized = await optimizeImagesForAnalysis(images);

    try {
        return await runNeuralwattAnalysis(optimized);
    } catch (err) {
        if (!isTimeoutLikeError(err) || optimized.length <= 1) {
            throw err;
        }

        console.warn('NeuralWatt batch analysis timed out — retrying with primary image only');
        return runNeuralwattAnalysis([optimized[0]]);
    }
}

// ============ FREEPIK / MAGNIFIC (Image Generation) ============

async function freepikRequest(path, options = {}) {
    const config = getConfig();
    if (!config.freepikKey) {
        throw new Error('FREEPIK_API_KEY is not configured');
    }

    const response = await fetch(`${config.freepikBase}${path}`, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'x-magnific-api-key': config.freepikKey,
            ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Freepik/Magnific error (${response.status}): ${errText}`);
    }

    return response.json();
}

function getPublicBaseUrl() {
    const configured = process.env.PUBLIC_BASE_URL || process.env.APP_URL || '';
    if (configured) return configured.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production') return 'https://design.krish.in.net';
    return `http://127.0.0.1:${process.env.PORT || 8006}`;
}

function resolveReferenceImageUrl(base64, mimeType = 'image/jpeg') {
    const sizeInMB = (base64.length * 0.75) / 1024 / 1024;
    if (sizeInMB > 20) {
        throw new Error(`Image too large (${sizeInMB.toFixed(2)}MB). Max 20MB allowed.`);
    }

    const filename = saveReferenceImage(base64, mimeType);
    const publicUrl = `${getPublicBaseUrl()}/api/images?filename=${encodeURIComponent(filename)}`;
    console.log(`Reference image hosted at ${publicUrl}`);
    return publicUrl;
}

async function uploadReferenceImages(images, scaleHints = []) {
    const uploaded = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const mimeType = img.mimeType || 'image/jpeg';
        const hint = scaleHints[i]?.hint || scaleHints[0]?.hint || '';
        console.log(`Preparing reference image ${i + 1}/${images.length}...`);
        const url = resolveReferenceImageUrl(img.base64, mimeType);
        uploaded.push({
            image: url,
            mime_type: mimeType,
            text: hint
                ? `Reference jewelry photo ${i + 1}. ${hint} Match this exact scale on the model.`
                : `Reference jewelry photo ${i + 1}. Match exact scale from photo on model — do not enlarge.`,
        });
    }

    return uploaded;
}

async function buildNanoBananaPayload(prompt, images, options = {}) {
    const aspectRatio = resolveAspectRatio(options.outputSize);
    const resolution = resolveResolution(options.outputSize);
    const fittedPrompt = prompt.length > MAGNIFIC_MAX_PROMPT_LENGTH
        ? fitPromptForMagnific(prompt)
        : prompt;
    console.log(`Magnific prompt: ${fittedPrompt.length} chars (max ${MAGNIFIC_MAX_PROMPT_LENGTH}${prompt.length !== fittedPrompt.length ? `, trimmed from ${prompt.length}` : ''})`);

    console.log(`Uploading ${images.length} reference images for Nano Banana 2...`);
    const referenceImages = await uploadReferenceImages(images.slice(0, 14), options.scaleHints || []);

    return {
        prompt: fittedPrompt,
        aspect_ratio: aspectRatio,
        resolution,
        use_google_search_tool: false,
        reference_images: referenceImages,
    };
}

async function freepikGenerate(prompt, images, options = {}) {
    const config = getConfig();
    const aspectRatio = resolveAspectRatio(options.outputSize);
    const resolution = resolveResolution(options.outputSize);

    console.log(`Freepik Generate: model=${config.imageModel} (Nano Banana 2), ${aspectRatio} @ ${resolution}, images=${images.length}`);

    const payload = await buildNanoBananaPayload(prompt, images, options);
    const result = await freepikRequest(`/v1/ai/text-to-image/${config.imageModel}`, {
        method: 'POST',
        body: payload,
    });

    const taskId = result.data?.task_id;
    if (!taskId) {
        throw new Error('No task_id returned from Freepik/Magnific API');
    }

    const jobId = `fpk_${taskId}`;

    return {
        images: [],
        jobId,
        status: 'processing',
        text: 'Image generation started...',
        provider: 'freepik',
    };
}

function extractTaskId(jobId) {
    if (jobId.startsWith('fpk_')) {
        return jobId.slice(4);
    }
    return jobId;
}

export async function checkJob(jobId) {
    const config = getConfig();
    const taskId = extractTaskId(jobId);

    try {
        const pollResponse = await freepikRequest(
            `/v1/ai/text-to-image/${config.imageModel}/${taskId}`
        );
        const data = pollResponse.data || {};
        const status = data.status;

        if (status === 'COMPLETED') {
            const outputUrl = data.generated?.[0];
            if (!outputUrl) {
                throw new Error('Task completed but no output URL returned');
            }

            const imageResponse = await fetch(outputUrl);
            const buffer = await imageResponse.arrayBuffer();
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

            return {
                status: 'completed',
                imageUrl: `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`,
            };
        }

        if (status === 'FAILED') {
            return { status: 'failed', error: data.error || 'Image generation failed' };
        }

        return { status: 'processing' };
    } catch (err) {
        console.error('Freepik Status Error:', err);
        return { status: 'failed', error: err.message };
    }
}

// ============ PUBLIC API ============

export async function analyzeJewelry(images) {
    return neuralwattAnalyze(images);
}

export async function generateImage(prompt, images, options = {}) {
    console.log(`generateImage: images=${images?.length || 0}, outputSize=${options?.outputSize}`);

    if (!images || images.length === 0) {
        throw new Error('No images provided to generateImage');
    }

    images.forEach((img, idx) => {
        if (!img.base64) {
            throw new Error(`Image ${idx} is missing base64 data`);
        }
    });

    return freepikGenerate(prompt, images, options);
}

export function buildJewelryPrompt(analysis, template, imageCount, extraPrompt = '', presetOptions = {}) {
    const result = buildJewelryPromptV2(analysis, template, imageCount, extraPrompt, presetOptions);

    if (process.env.NODE_ENV !== 'production') {
        console.log('\n╔══════════════════════════════════════════════════════════════════╗');
        console.log('║           PROMPT BUILDER - INPUT UNDERSTANDING                   ║');
        console.log('╚══════════════════════════════════════════════════════════════════╝\n');
        console.log(getGenerationSummary(result.understanding));
        console.log('\n────────────────────────────────────────────────────────────────────\n');
    }

    return result.prompt;
}

export function getCurrentConfig() {
    const config = getConfig();
    return {
        llmProvider: 'neuralwatt',
        imageProvider: 'freepik',
        model: config.neuralwattModel,
        modelId: config.neuralwattModel,
        imageModel: config.imageModel,
        hasNeuralwattKey: !!config.neuralwattKey && config.neuralwattKey !== 'your-neuralwatt-api-key-here',
        hasFreepikKey: !!config.freepikKey && config.freepikKey !== 'your-freepik-api-key-here',
    };
}

export { SIZE_MAP };