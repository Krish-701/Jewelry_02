import { NextResponse } from 'next/server';
import { analyzeJewelry } from '@/lib/ai-provider';

export const maxDuration = 180;

export async function POST(request) {
    try {
        const { images } = await request.json();

        if (!images || images.length === 0) {
            return NextResponse.json({ error: 'No images provided' }, { status: 400 });
        }

        // Send ALL images together for analysis
        const analysis = await analyzeJewelry(images);

        return NextResponse.json({ analysis });
    } catch (error) {
        console.error('Analyze error:', error);
        const message = error.message || 'Failed to analyze jewelry';
        const isTimeout = /timed out|timeout|\(504\)|\(408\)/i.test(message);
        return NextResponse.json(
            { error: message },
            { status: isTimeout ? 503 : 500 }
        );
    }
}
