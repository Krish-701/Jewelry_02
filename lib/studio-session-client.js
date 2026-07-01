const STORAGE_KEY = 'jewelryStudioSession';
export const NEW_SESSION_QUERY = 'new';

export function createClientSessionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `sess_${crypto.randomUUID().replace(/-/g, '')}`;
    }
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** URL for entering studio with a guaranteed fresh upload workflow */
export function studioEntryUrl() {
    return `/studio?${NEW_SESSION_QUERY}=1`;
}

export function isNewSessionRequest(searchParams) {
    if (!searchParams) return false;
    const value = searchParams.get(NEW_SESSION_QUERY);
    return value === '1' || value === 'true';
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