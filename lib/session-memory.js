import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const MAX_GENERATIONS = 20;

function ensureDir() {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId) {
    return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

export function createSessionId() {
    return `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function loadSession(sessionId) {
    if (!sessionId) return null;
    ensureDir();
    const file = sessionPath(sessionId);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return null;
    }
}

export function saveSession(sessionId, data) {
    if (!sessionId) return null;
    ensureDir();
    const existing = loadSession(sessionId) || { sessionId, generations: [] };
    const merged = {
        ...existing,
        ...data,
        sessionId,
        updatedAt: Date.now(),
        createdAt: existing.createdAt || Date.now(),
    };
    fs.writeFileSync(sessionPath(sessionId), JSON.stringify(merged, null, 2));
    return merged;
}

export function recordGeneration(sessionId, payload) {
    const session = loadSession(sessionId) || { sessionId, generations: [] };
    const generations = [
        {
            jobId: payload.jobId,
            timestamp: Date.now(),
            jewelryType: payload.jewelryType,
            sizes: payload.sizes,
            scaleSummary: payload.scaleSummary,
            templateId: payload.templateId,
        },
        ...(session.generations || []),
    ].slice(0, MAX_GENERATIONS);

    return saveSession(sessionId, {
        analysis: payload.analysis,
        sizes: payload.sizes,
        settings: payload.settings,
        generations,
    });
}

export function buildSessionPromptMemory(sessionId) {
    const session = loadSession(sessionId);
    if (!session) return '';

    const parts = [];
    const type = session.analysis?.type || 'jewelry';
    const genCount = session.generations?.length || 0;

    parts.push(`Session context: user uploaded ${type} reference images for this session.`);

    if (session.sizes && Object.keys(session.sizes).length > 0) {
        const sizeList = Object.entries(session.sizes)
            .filter(([, s]) => s?.value)
            .map(([, s]) => `${s.value} ${s.unit}`)
            .join(', ');
        if (sizeList) parts.push(`User-specified sizes for this session: ${sizeList}.`);
    }

    const lastGen = session.generations?.[0];
    if (lastGen?.scaleSummary) {
        parts.push(`Previous generation scale: ${lastGen.scaleSummary}.`);
    }

    if (genCount > 0) {
        parts.push(
            `Generation #${genCount + 1} in this session — keep jewelry scale identical to user sizes and reference photos. Do not enlarge jewelry between generations.`
        );
    }

    return parts.join(' ');
}