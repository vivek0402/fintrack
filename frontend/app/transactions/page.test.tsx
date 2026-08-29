import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TransactionsPage from './page';
import { transactionsAPI } from '@/lib/api';
import { getCachedTransactions, cacheTransactions } from '@/lib/offlineCache';

// Page-level composition: the layer above the component tests. What is asserted
// here is what only exists at this level -- the month/year params the page
// sends, and the offline-cache fallback, which is a resilience path users only
// reach when the backend is failing and which therefore rots silently.

const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => searchParams,
}));

vi.mock('@/store/authStore', () => ({
    useAuthStore: () => ({
        user: { id: 'u1', currency: 'INR' },
        isLoading: false,
        loadFromStorage: vi.fn(),
    }),
}));

vi.mock('@/hooks/useWindowSize', () => ({ useIsMobile: () => false }));

vi.mock('@/lib/api', () => ({
    transactionsAPI: { getAll: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn(), search: vi.fn() },
    aiAPI:           { getInsights: vi.fn().mockResolvedValue({ data: {} }) },
    accountsAPI:     { getAll: vi.fn().mockResolvedValue({ data: { accounts: [] } }) },
    creditCardsAPI:  { getAll: vi.fn().mockResolvedValue({ data: { cards: [] } }) },
    categoriesAPI:   { getAll: vi.fn().mockResolvedValue({ data: { categories: [] } }), create: vi.fn() },
    goalsAPI:        { getAll: vi.fn().mockResolvedValue({ data: { goals: [] } }) },
    marketDataAPI:   { searchMutualFunds: vi.fn(), getLatestNav: vi.fn() },
}));

vi.mock('@/lib/apiWithCache', () => ({
    apiWithCache: { getDashboardSummary: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock('@/lib/offlineCache', () => ({
    cacheTransactions: vi.fn().mockResolvedValue(undefined),
    getCachedTransactions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/store/toastStore', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), undo: vi.fn() },
}));

const rows = [
    { id: 'a', description: 'Coffee', amount: '250',  date: '2026-08-10', type: 'expense' },
    { id: 'b', description: 'Salary', amount: '50000', date: '2026-08-05', type: 'income' },
];

const getAll = transactionsAPI.getAll as ReturnType<typeof vi.fn>;
const cached = getCachedTransactions as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    getAll.mockResolvedValue({ data: { transactions: rows } });
    cached.mockResolvedValue([]);
});

describe('data fetching', () => {
    it('requests the current month and year rather than the whole history', async () => {
        render(<TransactionsPage />);
        await waitFor(() => expect(getAll).toHaveBeenCalled());

        const params = getAll.mock.calls[0][0];
        expect(params).toHaveProperty('month');
        expect(params).toHaveProperty('year');
        expect(typeof params.month).toBe('number');
    });

    it('renders what came back', async () => {
        render(<TransactionsPage />);
        expect(await screen.findByText('Coffee')).toBeInTheDocument();
        expect(screen.getByText('Salary')).toBeInTheDocument();
    });

    it('writes successful results to the offline cache', async () => {
        render(<TransactionsPage />);
        await waitFor(() => expect(cacheTransactions).toHaveBeenCalledWith(rows));
    });

    it('scopes to one card and widens to all-time when the URL says so', async () => {
        // Reached from the Accounts page's per-card "History" button. Two
        // things happen together: the id is coerced to a number, and the month
        // pager is cleared, because a card's history is only useful whole --
        // scoping to a card but still showing one month would look empty.
        searchParams = new URLSearchParams('credit_card_id=7');
        render(<TransactionsPage />);

        // The id lands in state via an effect, so a first fetch goes out
        // before it -- assert the eventual request, not the first.
        await waitFor(() => {
            const scoped = getAll.mock.calls.map(([p]) => p).find(p => p?.credit_card_id);
            expect(scoped).toBeDefined();
            expect(scoped.credit_card_id).toBe(7);
            expect(scoped.month).toBeUndefined();
        });
    });
});

describe('offline fallback', () => {
    it('falls back to cached transactions when the request fails', async () => {
        // Deliberately not routed through apiWithCache, so that a failing
        // backend stays distinguishable from an empty month.
        getAll.mockRejectedValue(new Error('network down'));
        cached.mockResolvedValue(rows);

        render(<TransactionsPage />);
        expect(await screen.findByText('Coffee')).toBeInTheDocument();
    });

    it('surfaces an error state only when the cache is empty too', async () => {
        getAll.mockRejectedValue(new Error('network down'));
        cached.mockResolvedValue([]);

        render(<TransactionsPage />);
        await waitFor(() => expect(cached).toHaveBeenCalled());
        // Nothing to show and nothing cached -- the user must be told, not
        // shown an empty list that looks like "no transactions this month".
        await waitFor(() =>
            expect(document.body.textContent).toMatch(/couldn't load|could not load|try again|something went wrong/i));
    });

    it('does not claim an error when the request merely returns nothing', async () => {
        getAll.mockResolvedValue({ data: { transactions: [] } });
        render(<TransactionsPage />);
        await waitFor(() => expect(getAll).toHaveBeenCalled());
        expect(document.body.textContent).not.toMatch(/couldn't load|could not load/i);
    });
});
