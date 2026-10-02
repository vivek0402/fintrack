// The three pinned shortcuts at the top of the mobile More panel adapt to
// the person: they are the More pages they open most on this device. Until
// there's enough history, the defaults fill the remaining slots.

const STORAGE_KEY = 'fintrack-more-visits';
export const DEFAULT_PINS = ['/budgets', '/goals', '/accounts'];
const PIN_COUNT = 3;

type Visits = Record<string, number>;

function read(): Visits {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/** Count a visit to `href` if it is one of the More pages. */
export function recordMoreVisit(href: string, morePages: readonly string[]) {
    const page = morePages.find(p => href === p || href.startsWith(p + '/'));
    if (!page) return;
    const visits = read();
    visits[page] = (visits[page] ?? 0) + 1;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visits)); } catch { /* storage unavailable */ }
}

/** The pages to pin: most visited first, then defaults, never duplicated. */
export function pinnedMorePages(visits: Visits = read()): string[] {
    const byUse = Object.entries(visits)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1] || DEFAULT_PINS.indexOf(a[0]) - DEFAULT_PINS.indexOf(b[0]))
        .map(([href]) => href);
    const pins: string[] = [];
    for (const href of [...byUse, ...DEFAULT_PINS]) {
        if (!pins.includes(href)) pins.push(href);
        if (pins.length === PIN_COUNT) break;
    }
    return pins;
}
