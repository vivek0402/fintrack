import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/test-utils';

let user: { id: string } | null = { id: 'u1' };
vi.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user }) }));
vi.mock('@/lib/offlineCache', () => ({
    cacheTransactions: vi.fn().mockResolvedValue(undefined),
    getCachedTransactions: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/api', () => {
    const ok = (data: object) => vi.fn().mockResolvedValue({ data });
    return {
        transactionsAPI: { getAll: ok({ transactions: [] }) },
        analyticsAPI: { summary: ok({ summary: {} }), trends: ok({ trends: [] }), yearly: ok({}), paymentMethods: ok({ breakdown: [] }) },
        budgetsAPI: { getAll: ok({ budgets: [] }) },
        goalsAPI: { getAll: ok({ goals: [] }) },
        recurringAPI: { process: ok({}) },
        accountsAPI: { getAll: ok({ accounts: [] }) },
        creditCardsAPI: { getAll: ok({ cards: [] }) },
    };
});

import { usePrefetchTabData } from './queries';

beforeEach(() => { vi.useFakeTimers(); user = { id: 'u1' }; });
afterEach(() => vi.useRealTimers());

function run() {
    const qc = createTestQueryClient();
    renderHook(() => usePrefetchTabData(), {
        wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    return qc;
}

describe('usePrefetchTabData', () => {
    it('warms Home, Money and Insights for this month, after a short delay', async () => {
        const qc = run();
        expect(qc.getQueryCache().getAll()).toHaveLength(0);
        await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

        const now = new Date();
        const m = now.getMonth() + 1, y = now.getFullYear();
        expect(qc.getQueryData(['dashboard', 'u1', m, y])).toBeDefined();
        expect(qc.getQueryData(['transactions', 'u1', { month: m, year: y }])).toEqual([]);
        expect(qc.getQueryData(['analytics', 'u1', 'overview', m, y])).toBeDefined();
    });

    it('does nothing while signed out', async () => {
        user = null;
        const qc = run();
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
        expect(qc.getQueryCache().getAll()).toHaveLength(0);
    });
});
