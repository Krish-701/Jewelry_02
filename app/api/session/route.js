import { NextResponse } from 'next/server';
import { isValidSessionId, loadSession, saveSession } from '@/lib/session-memory';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId || !isValidSessionId(sessionId)) {
        return NextResponse.json({ error: 'Valid sessionId required' }, { status: 400 });
    }
    const session = loadSession(sessionId);
    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ session });
}

export async function POST(request) {
    try {
        const { sessionId, analysis, sizes, settings } = await request.json();
        if (!sessionId || !isValidSessionId(sessionId)) {
            return NextResponse.json({ error: 'Valid sessionId required' }, { status: 400 });
        }
        const session = saveSession(sessionId, { analysis, sizes, settings });
        return NextResponse.json({ session });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}