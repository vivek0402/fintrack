import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyticsAPI, transactionsAPI, budgetsAPI, goalsAPI } from '@/lib/api';
import { fetchDashboard, type DashboardData } from './queries';

vi.mock('@/lib/api', () => ({
    analyticsAPI:    { summary: vi.fn(), trends: vi.fn() },
    transactionsAPI: { getAll: vi.fn() },
    budgetsAPI:      { getAll: vi.fn() },
    goalsAPI:        { getAll: vi.fn() },
    recurringAPI:    { process: vi.fn().mockResolvedValue({}) },
}));

const m = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const summary = { total_income: 50000, total_expenses: 1200 };
const rateLimited = Object.assign(new Error('429'), { response: { status: 429 } });

beforeEach(() => {
    vi.clearAllMocks();
    m(analyticsAPI.summary).mockResolvedValue({ data: { summary } });
    m(analyticsAPI.trends).mockResolvedValue({ data: { trends: [{ month: 'Oct' }] } });
    m(transactionsAPI.getAll).mockResolvedValue({ data: { transactions: [{ id: 'new' }] } });
    m(budgetsAPI.getAll).mockResolvedValue({ data: { budgets: [{ id: 'b' }] } });
    m(goalsAPI.getAll).mockResolvedValue({ data: { goals: [{ id: 'g' }] } });
});

describe('fetchDashboard', () => {
    it('keeps the totals when a secondary call fails, instead of failing the whole bundle', async () => {
        m(transactionsAPI.getAll).mockRejectedValue(rateLimited);
        const previous = { transactions: [{ id: 'old' }] } as unknown as DashboardData;

        const data = await fetchDashboard(10, 2026, previous);

        expect(data.summary).toEqual(summary);
        expect(data.transactions).toEqual([{ id: 'old' }]);   // last good copy
        expect(data.budgets).toEqual([{ id: 'b' }]);
    });

    it('falls back to empty when a secondary call fails and nothing was cached', async () => {
        m(goalsAPI.getAll).mockRejectedValue(rateLimited);
        const data = await fetchDashboard(10, 2026);
        expect(data.goals).toEqual([]);
        expect(data.summary).toEqual(summary);
    });

    it('still fails when the summary itself fails, so the page can say so', async () => {
        m(analyticsAPI.summary).mockRejectedValue(rateLimited);
        await expect(fetchDashboard(10, 2026)).rejects.toBe(rateLimited);
    });
});
