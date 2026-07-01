import sharp from 'sharp';

const ANALYSIS_MAX_EDGE = 1024;
const ANALYSIS_JPEG_QUALITY = 82;
const ANALYSIS_MAX_IMAGES = 4;

function stripBase64Prefix(data) {
    return (data || '').replace(/^data:image\/\w+;base64,/, '');
}

/**
 * Resize and compress images before sending to NeuralWatt vision API.
 * Full-resolution originals are still used for Magnific generation.
 */
export async function optimizeImagesForAnalysis(images, { maxImages = ANALYSIS_MAX_IMAGES } = {}) {
    const selected = images.slice(0, maxImages);
    return Promise.all(selected.map(optimizeOneForAnalysis));
}

async function optimizeOneForAnalysis(img) {
    const raw = stripBase64Prefix(img.base64);
    if (!raw) return img;

    try {
        const input = Buffer.from(raw, 'base64');
        const optimized = await sharp(input)
            .rotate()
            .resize(ANALYSIS_MAX_EDGE, ANALYSIS_MAX_EDGE, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .jpeg({ quality: ANALYSIS_JPEG_QUALITY, mozjpeg: true })
            .toBuffer();

        return {
            ...img,
            base64: optimized.toString('base64'),
            mimeType: 'image/jpeg',
        };
    } catch (err) {
        console.warn('Image optimize skipped, using original:', err.message);
        return img;
    }
}