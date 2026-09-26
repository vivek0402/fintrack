// Filtering logic for the Transactions page's search/filter bar
// (components/transactions/AdvancedSearchBar.tsx). Split out from the
// component so the rendering stays focused and this stays independently
// readable -- same functions as before, just moved, with the token
// mini-language removed and paymentMethods/accountIds added.

export interface PanelFilters {
    amountMin: string;
    amountMax: string;
    categories: string[];
    type: 'all' | 'income' | 'expense';
    // 'default' respects whatever date range the page's own month pager
    // already fetched (no override). 'all' shows every transaction ever,
    // no bound. 'custom' filters to dateFrom/dateTo. Both 'all' and
    // 'custom' need the page to widen its server-side fetch beyond the
    // current month -- see onSetDateContext.
    dateMode: 'default' | 'all' | 'custom';
    dateFrom: string;
    dateTo: string;
    tags: string[];
    paymentMethods: string[];
    accountIds: number[];
    hasNotes: boolean;
}

// Minimal shape these filter/sort helpers actually read. Callers pass their
// real transaction type (whatever shape the page/component uses) and get it
// back unchanged -- these functions never construct new transaction objects,
// they only filter/reorder the array, so a generic bound on the accessed
// fields keeps the caller's concrete type flowing through untouched.
export interface FilterableTransaction {
    id: string;
    description?: string | null;
    category_name?: string | null;
    notes?: string | null;
    tags?: string[] | null;
    amount: number | string;
    type: string;
    date: string;
    payment_method?: string | null;
    account_id?: number | null;
}

export const DEFAULT_PANEL: PanelFilters = {
    amountMin: '', amountMax: '',
    categories: [], type: 'all',
    dateMode: 'default', dateFrom: '', dateTo: '',
    tags: [], paymentMethods: [], accountIds: [],
    hasNotes: false,
};

function getDateBounds(mode: PanelFilters['dateMode'], from: string, to: string): [Date | null, Date | null] {
    if (mode === 'custom') return [from ? new Date(from) : null, to ? new Date(to) : null];
    return [null, null];
}

export function applyAdvancedFilters<T extends FilterableTransaction>(
    transactions: T[],
    freeText: string,
    panel: PanelFilters,
): T[] {
    const text = freeText.trim().toLowerCase();
    let r = [...transactions];

    if (text) {
        r = r.filter(tx =>
            tx.description?.toLowerCase().includes(text) ||
            tx.category_name?.toLowerCase().includes(text) ||
            tx.notes?.toLowerCase().includes(text) ||
            tx.tags?.some((t: string) => t.toLowerCase().includes(text))
        );
    }

    if (panel.amountMin) { const n = parseFloat(panel.amountMin); if (!isNaN(n)) r = r.filter(tx => parseFloat(String(tx.amount)) >= n); }
    if (panel.amountMax) { const n = parseFloat(panel.amountMax); if (!isNaN(n)) r = r.filter(tx => parseFloat(String(tx.amount)) <= n); }
    if (panel.categories.length > 0) r = r.filter(tx => panel.categories.some(c => tx.category_name?.toLowerCase() === c.toLowerCase()));
    if (panel.type !== 'all') r = r.filter(tx => tx.type === panel.type);
    if (panel.dateMode !== 'default') {
        const [from, to] = getDateBounds(panel.dateMode, panel.dateFrom, panel.dateTo);
        r = r.filter(tx => {
            const d = new Date((tx.date || '').split('T')[0]);
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });
    }
    if (panel.tags.length > 0) r = r.filter(tx => panel.tags.some(tag => tx.tags?.includes(tag)));
    if (panel.paymentMethods.length > 0) r = r.filter(tx => tx.payment_method != null && panel.paymentMethods.includes(tx.payment_method));
    if (panel.accountIds.length > 0) r = r.filter(tx => tx.account_id != null && panel.accountIds.includes(tx.account_id));
    if (panel.hasNotes) r = r.filter(tx => tx.notes && tx.notes.trim());

    return r;
}

// Drops ids that fell out of the current filter results (e.g. select mode was
// active, then the user narrowed the filter) so bulk ops can't silently act
// on rows no longer visible. Returns the same `prev` reference when nothing
// changed, so callers using this as a setState updater don't trigger an
// unnecessary re-render.
export function pruneSelectedIds(prev: Set<string>, filtered: { id: string }[]): Set<string> {
    if (prev.size === 0) return prev;
    const filteredIds = new Set(filtered.map(tx => tx.id));
    const next = new Set([...prev].filter(id => filteredIds.has(id)));
    return next.size === prev.size ? prev : next;
}

export type SortKey = 'newest' | 'oldest' | 'largest' | 'smallest';

export const DEFAULT_SORT: SortKey = 'newest';

export function sortTransactions<T extends FilterableTransaction>(transactions: T[], key: SortKey): T[] {
    const r = [...transactions];
    switch (key) {
        case 'oldest':   return r.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        case 'largest':  return r.sort((a, b) => parseFloat(String(b.amount)) - parseFloat(String(a.amount)));
        case 'smallest': return r.sort((a, b) => parseFloat(String(a.amount)) - parseFloat(String(b.amount)));
        case 'newest':
        default:         return r.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
}

export function countActiveFilters(freeText: string, panel: PanelFilters): number {
    let n = 0;
    if (freeText.trim()) n++;
    if (panel.amountMin || panel.amountMax) n++;
    if (panel.categories.length) n++;
    if (panel.type !== 'all') n++;
    if (panel.dateMode !== 'default') n++;
    if (panel.tags.length) n++;
    if (panel.paymentMethods.length) n++;
    if (panel.accountIds.length) n++;
    if (panel.hasNotes) n++;
    return n;
}
