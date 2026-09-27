// Per-device history of the health score, one reading per day, kept in
// localStorage. The key is unchanged from the old /health-score page so
// readings recorded there carry over.

export const HEALTH_HISTORY_KEY = 'fintrack-health-history';
const MAX_ENTRIES = 90; // ~3 months of daily readings, enough to always hold last month

export interface HealthHistoryEntry { date: string; score: number; }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function readHealthHistory(): HealthHistoryEntry[] {
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(HEALTH_HISTORY_KEY) ?? '[]');
        return Array.isArray(raw)
            ? raw.filter((e): e is HealthHistoryEntry => !!e && typeof e.date === 'string' && typeof e.score === 'number')
            : [];
    } catch {
        return [];
    }
}

/** Upserts today's reading and returns the updated history. */
export function recordHealthScore(score: number, now: Date = new Date()): HealthHistoryEntry[] {
    const today = localDateStr(now);
    const history = readHealthHistory().filter(e => e.date !== today);
    const next = [...history, { date: today, score }]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-MAX_ENTRIES);
    try { localStorage.setItem(HEALTH_HISTORY_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
    return next;
}

/**
 * Change vs. the last reading recorded in the previous calendar month.
 * Returns null when there is no reading from last month -- the UI then shows
 * no change pill rather than comparing against something else.
 */
export function changeSinceLastMonth(
    history: HealthHistoryEntry[],
    score: number,
    now: Date = new Date(),
): { delta: number; monthLabel: string } | null {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prefix = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = history
        .filter(e => e.date.startsWith(prefix))
        .sort((a, b) => a.date.localeCompare(b.date));
    const ref = lastMonth[lastMonth.length - 1];
    if (!ref) return null;
    return { delta: score - ref.score, monthLabel: MONTHS[prev.getMonth()] };
}
