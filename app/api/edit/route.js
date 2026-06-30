import { NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai-provider';
import { saveImage, savePrompt, saveHistoryEntry, getImagePath, imageExists } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300;

/**
 * Edit API - Takes an existing image and edit instructions,
 * generates a new image based on the original + edit prompt
 */
export async function POST(request) {
    try {
        const {
            jobId: originalJobId,
            imageUrl,
            imageFilename,
            originalPrompt,
            editPrompt,
            outputSize = 'portrait',
            templateId = 'south-indian',
            templateName = 'AI Generated',
        } = await request.json();

        if (!originalJobId) {
            return NextResponse.json({ error: 'Original job ID is required' }, { status: 400 });
        }

        if (!editPrompt || !editPrompt.trim()) {
            return NextResponse.json({ error: 'Edit prompt is required' }, { status: 400 });
        }

        // Get the original image data
        let originalImageBase64 = null;
        let originalMimeType = 'image/jpeg';

        // Try to get image from filename first
        if (imageFilename && imageExists(imageFilename)) {
            const imgPath = getImagePath(imageFilename);
            const buffer = fs.readFileSync(imgPath);
            originalImageBase64 = buffer.toString('base64');
            originalMimeType = imageFilename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        } else if (imageUrl) {
            // Try to extract from imageUrl (could be /api/images?filename=...)
            const urlMatch = imageUrl.match(/filename=([^&]+)/);
            if (urlMatch) {
                const filename = decodeURIComponent(urlMatch[1]);
                if (imageExists(filename)) {
                    const imgPath = getImagePath(filename);
                    const buffer = fs.readFileSync(imgPath);
                    originalImageBase64 = buffer.toString('base64');
                    originalMimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
                }
            }
        }

        // Fallback: try common filename patterns
        if (!originalImageBase64) {
            const possibleFilenames = [
                `${originalJobId}.jpg`,
                `${originalJobId}.png`,
                `${originalJobId}.jpeg`,
            ];
            
            for (const filename of possibleFilenames) {
                if (imageExists(filename)) {
                    const imgPath = getImagePath(filename);
                    const buffer = fs.readFileSync(imgPath);
                    originalImageBase64 = buffer.toString('base64');
                    originalMimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    break;
                }
            }
        }

        if (!originalImageBase64) {
            return NextResponse.json({ 
                error: 'Could not find original image file. It may have been deleted.' 
            }, { status: 404 });
        }

        // Build the edit prompt - combine original context with edit instructions
        const fullEditPrompt = buildEditPrompt(originalPrompt, editPrompt);

        console.log('\n' + '='.repeat(70));
        console.log('EDIT GENERATION');
        console.log('='.repeat(70));
        console.log('Original Job ID:', originalJobId);
        console.log('Edit Instructions:', editPrompt);
        console.log('Output Size:', outputSize);
        console.log('='.repeat(70) + '\n');

        // Generate new image using the original as reference
        const result = await generateImage(fullEditPrompt, [{
            base64: originalImageBase64,
            mimeType: originalMimeType,
        }], { 
            outputSize,
            isEdit: true, // Flag to indicate this is an edit operation
        });

        if (!result.images && result.status !== 'processing') {
            return NextResponse.json(
                { error: 'No image was generated. Try again or adjust your edit instructions.' },
                { status: 500 }
            );
        }

        // Save prompt to disk
        savePrompt(result.jobId, fullEditPrompt);

        // Save new image to disk
        let newImageUrl = null;
        let newImageFilename = null;
        if (result.images && result.images.length > 0) {
            const img = result.images[0];
            newImageFilename = `${result.jobId}.${img.mimeType?.includes('png') ? 'png' : 'jpg'}`;
            newImageUrl = saveImage(result.jobId, img.data, img.mimeType);
        }

        // Save history entry
        const historyEntry = saveHistoryEntry({
            jobId: result.jobId,
            status: result.status || 'completed',
            prompt: fullEditPrompt.substring(0, 200) + '...',
            templateName: `${templateName} (Edited)`,
            templateId: templateId,
            outputSize,
            imageUrl: newImageUrl,
            imageFilename: newImageFilename,
            thumbnail: `data:${originalMimeType};base64,${originalImageBase64.substring(0, 100)}...`,
            timestamp: Date.now(),
            parentJobId: originalJobId, // Track parent-child relationship
            editInstructions: editPrompt, // Store what was changed
        });

        return NextResponse.json({
            images: result.images || [],
            jobId: result.jobId,
            status: result.status || 'completed',
            prompt: fullEditPrompt,
            outputSize,
            templateId,
            imageUrl: newImageUrl,
            parentJobId: originalJobId,
        });

    } catch (error) {
        console.error('Edit generation error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to edit image' },
            { status: 500 }
        );
    }
}

/**
 * Build a prompt for image editing that combines original context with edit instructions
 */
function buildEditPrompt(originalPrompt, editPrompt) {
    // Create an edit-focused prompt that references the original
    let prompt = `[IMAGE EDIT REQUEST]\n\n`;
    
    if (originalPrompt) {
        prompt += `Original context: ${originalPrompt.substring(0, 500)}${originalPrompt.length > 500 ? '...' : ''}\n\n`;
    }
    
    prompt += `EDIT INSTRUCTIONS (apply these changes to the reference image):\n`;
    prompt += `${editPrompt}\n\n`;
    
    prompt += `Requirements:\n`;
    prompt += `- Keep the jewelry piece identical in style, design, and details\n`;
    prompt += `- Apply only the requested modifications\n`;
    prompt += `- Maintain photorealistic quality and professional lighting\n`;
    prompt += `- Preserve the original composition unless specifically asked to change it\n`;
    
    return prompt;
}
