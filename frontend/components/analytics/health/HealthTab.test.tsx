import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { calculateHealthScore, type HealthInput } from '@/lib/healthScore';
import { changeSinceLastMonth, recordHealthScore, HEALTH_HISTORY_KEY } from '@/lib/healthHistory';
import { aiAPI, analyticsAPI, budgetsAPI, goalsAPI, debtAPI } from '@/lib/api';
import { HealthScoreCard, HealthFactorList, HealthTab, factorTone } from './HealthTab';
import { HealthReportPanel } from './HealthReportPanel';

const m = (fn: unknown) => fn as Mock;

vi.mock('@/store/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1' }, isLoading: false, loadFromStorage: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
    aiAPI: { healthReport: vi.fn() },
    analyticsAPI: { summary: vi.fn(), trends: vi.fn(), getInvestmentRatio: vi.fn() },
    budgetsAPI: { getAll: vi.fn() },
    goalsAPI: { getAll: vi.fn() },
    debtAPI: { getDti: vi.fn(), getCreditUtilization: vi.fn() },
}));

const input: HealthInput = {
    income: 100000, expenses: 82000,
    budgets: [
        { amount: 5000, spent: 4000 }, { amount: 5000, spent: 6000 }, { amount: 3000, spent: 1000 },
        { amount: 2000, spent: 2500 }, { amount: 1000, spent: 500 },
    ],
    goals: [],
    monthlyIncome: [100000, 100000], monthlyExpenses: [85000, 82000],
    investedThisMonth: 12000, dtiRatio: 24, ccUtilizationPct: 0,
};
const result = calculateHealthScore(input);

const REPORT = {
    score: result.score,
    narrative: 'Your spending is the main drag on this score.',
    strengths: ['Income is steady'], weak_spots: ['Two budgets over'], next_steps: ['Trim dining out'],
    generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe('HealthScoreCard', () => {
    it('shows the calculateHealthScore number and label', () => {
        render(<HealthScoreCard result={result} change={null} />);
        expect(screen.getByTestId('health-score-value')).toHaveTextContent(String(result.score));
        expect(screen.getByText(result.label)).toBeInTheDocument();
    });

    it('shows no change pill when there is no reading from last month', () => {
        render(<HealthScoreCard result={result} change={null} />);
        expect(screen.queryByTestId('health-change-pill')).not.toBeInTheDocument();
        expect(screen.queryByText(/since/)).not.toBeInTheDocument();
    });

    it('shows the change vs last month when it exists', () => {
        render(<HealthScoreCard result={result} change={{ delta: 4, monthLabel: 'August' }} />);
        expect(screen.getByTestId('health-change-pill')).toHaveTextContent('+4');
        expect(screen.getByText('Up 4 since August')).toBeInTheDocument();
    });
});

describe('HealthFactorList', () => {
    it('renders one row per factor with the lib name, value and a semantic pill', () => {
        render(<HealthFactorList factors={result.breakdown} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(result.breakdown.length);
        for (const f of result.breakdown) {
            const row = screen.getByTestId(`health-factor-${f.id}`);
            expect(within(row).getByText(f.name)).toBeInTheDocument();
            const pillText = f.value ?? `${f.score}/${f.max}`;
            const pill = within(row).getByText(pillText);
            expect(pill).toHaveAttribute('data-tone', factorTone(f));
        }
        // Real measurements from the lib, not invented ones.
        expect(within(screen.getByTestId('health-factor-savings')).getByText('18%')).toBeInTheDocument();
        expect(within(screen.getByTestId('health-factor-budgets')).getByText('3 of 5 kept')).toBeInTheDocument();
        expect(within(screen.getByTestId('health-factor-debt')).getByText('24% DTI')).toBeInTheDocument();
    });
});

describe('HealthReportPanel', () => {
    it('peeks at the cache with the computed score and opens the report on tap', async () => {
        m(aiAPI.healthReport).mockResolvedValue({ data: { report: REPORT } });
        render(<HealthReportPanel result={result} />);

        await waitFor(() => expect(screen.getByText(/Explains this score · 2h ago/)).toBeInTheDocument());
        const call = m(aiAPI.healthReport).mock.calls[0][0];
        expect(call.peek).toBe(true);
        expect(call.score).toBe(result.score);
        expect(call.factors).toEqual(result.breakdown.map(f => ({ id: f.id, score: f.score, max: f.max })));

        expect(screen.queryByText(REPORT.narrative)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /AI report card/ }));
        expect(screen.getByText(REPORT.narrative)).toBeInTheDocument();
        expect(screen.getByText('Two budgets over')).toBeInTheDocument();
        // Opening a cached report does not trigger a second (AI) call.
        expect(aiAPI.healthReport).toHaveBeenCalledTimes(1);
    });

    it('generates the report on first open when nothing is cached', async () => {
        m(aiAPI.healthReport)
            .mockResolvedValueOnce({ data: { report: null } })
            .mockResolvedValueOnce({ data: { report: REPORT } });
        render(<HealthReportPanel result={result} />);
        await waitFor(() => expect(screen.getByText(/Not generated yet/)).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /AI report card/ }));
        await waitFor(() => expect(screen.getByText(REPORT.narrative)).toBeInTheDocument());
        const second = m(aiAPI.healthReport).mock.calls[1][0];
        expect(second.peek).toBeUndefined();
        expect(second.score).toBe(result.score);
    });
});

describe('HealthTab', () => {
    it('computes the score from the API data via calculateHealthScore', async () => {
        m(analyticsAPI.summary).mockResolvedValue({ data: { summary: { total_income: 100000, total_expenses: 82000 } } });
        m(analyticsAPI.trends).mockResolvedValue({ data: { trends: [] } });
        m(analyticsAPI.getInvestmentRatio).mockResolvedValue({ data: { invested_this_month: 12000 } });
        m(budgetsAPI.getAll).mockResolvedValue({ data: { budgets: input.budgets } });
        m(goalsAPI.getAll).mockResolvedValue({ data: { goals: [] } });
        m(debtAPI.getDti).mockResolvedValue({ data: { dti_ratio: 24 } });
        m(debtAPI.getCreditUtilization).mockResolvedValue({ data: null });
        m(aiAPI.healthReport).mockResolvedValue({ data: { report: null } });

        const expected = calculateHealthScore({ ...input, monthlyIncome: [], monthlyExpenses: [] });
        render(<HealthTab />);
        await waitFor(() => expect(screen.getByTestId('health-score-value')).toHaveTextContent(String(expected.score)));
        // First ever reading: no last-month history, so no change pill.
        expect(screen.queryByTestId('health-change-pill')).not.toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem(HEALTH_HISTORY_KEY)!)).toHaveLength(1);
    });
});

describe('healthHistory', () => {
    it('compares against the last reading from the previous calendar month only', () => {
        const now = new Date(2026, 8, 27); // 27 Sep 2026
        const history = [
            { date: '2026-07-30', score: 40 },
            { date: '2026-08-03', score: 55 },
            { date: '2026-08-29', score: 58 },
            { date: '2026-09-10', score: 60 },
        ];
        expect(changeSinceLastMonth(history, 62, now)).toEqual({ delta: 4, monthLabel: 'August' });
        expect(changeSinceLastMonth(history.filter(h => !h.date.startsWith('2026-08')), 62, now)).toBeNull();
    });

    it('keeps one reading per day', () => {
        const day = new Date(2026, 8, 27, 9);
        recordHealthScore(50, day);
        const h = recordHealthScore(52, new Date(2026, 8, 27, 18));
        expect(h).toEqual([{ date: '2026-09-27', score: 52 }]);
    });
});
