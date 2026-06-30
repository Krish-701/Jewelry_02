import { buildJewelryPromptV2, getGenerationSummary } from './prompt-builder.js';

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
- pieces: array of {type, description, sizeHint, sizeUnit} for each distinct piece. sizeHint describes the typical measurement needed (e.g., "Ring Size (India)", "Length", "Diameter", "Chain Length"). sizeUnit is the unit like "cm", "mm", or "India size"
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

    const response = await fetch(`${config.neuralwattBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.neuralwattKey}`,
        },
        body: JSON.stringify({
            model: config.neuralwattModel,
            messages,
            max_tokens: options.max_tokens ?? 4096,
            temperature: options.temperature ?? 0.7,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`NeuralWatt error (${response.status}): ${errText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
}

async function neuralwattAnalyze(images) {
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
    ], { temperature: 0.3 });

    return parseAnalysisJson(text);
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

async function uploadToCatbox(base64DataUri) {
    if (base64DataUri.startsWith('http')) return base64DataUri;

    const base64Data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
    const mimeMatch = base64DataUri.match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const extension = mimeType.split('/')[1] || 'jpg';

    const sizeInMB = (base64Data.length * 0.75) / 1024 / 1024;
    if (sizeInMB > 20) {
        throw new Error(`Image too large (${sizeInMB.toFixed(2)}MB). Max 20MB allowed.`);
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', blob, `image.${extension}`);

    const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Catbox upload failed (${response.status}): ${errText}`);
    }

    return (await response.text()).trim();
}

async function uploadReferenceImages(images) {
    const uploaded = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const mimeType = img.mimeType || 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${img.base64}`;
        console.log(`Uploading reference image ${i + 1}/${images.length}...`);
        const url = await uploadToCatbox(dataUri);
        uploaded.push({
            image: url,
            mime_type: mimeType,
            text: `Reference image ${i + 1}`,
        });
    }

    return uploaded;
}

async function buildNanoBananaPayload(prompt, images, options = {}) {
    const aspectRatio = resolveAspectRatio(options.outputSize);
    const resolution = resolveResolution(options.outputSize);

    console.log(`Uploading ${images.length} reference images for Nano Banana 2...`);
    const referenceImages = await uploadReferenceImages(images.slice(0, 14));

    return {
        prompt,
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