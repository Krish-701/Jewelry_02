const STORAGE_KEY = 'jewelryStudioSession';

export function createClientSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadClientSession() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveClientSession(data) {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            updatedAt: Date.now(),
        }));
    } catch (e) {
        console.warn('Could not save studio session', e);
    }
}

export function clearClientSession() {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(STORAGE_KEY);
}