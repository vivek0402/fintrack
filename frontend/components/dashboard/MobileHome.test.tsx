import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithQuery as render } from '@/lib/test-utils';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/api', () => ({
    analyticsAPI: { getNetWorth: vi.fn().mockResolvedValue({ data: { current: { net_worth: 1248000 }, history: [{ net_worth: 1100000 }, { net_worth: 1248000 }] } }) },
}));
// The real dialog loads accounts, cards and goals; here we only need to see it open with the row.
vi.mock('@/components/transactions/TransactionModal', () => ({
    TransactionModal: ({ isOpen, transaction }: { isOpen: boolean; transaction: { description: string } | null }) =>
        isOpen ? <div role="dialog">Editing {transaction?.description}</div> : null,
}));

import { MobileHome, type MobileHomeProps } from './MobileHome';
import type { Budget, Transaction } from '@/types/finance';

const today = new Date().toISOString().split('T')[0];

const props = (over: Partial<MobileHomeProps> = {}): MobileHomeProps => ({
    month: 11, year: 2026, isCurrentMonth: true, onPickMonth: vi.fn(), greeting: 'Good evening, Asha', loading: false,
    net: 49400, income: 96500, expenses: 47100, savingsPct: 51,
    investmentRatio: { ratio_pct: 15.5, invested_this_month: 15000, income_this_month: 96500 },
    trend: [{ month: 'Oct', income: 96500, expenses: 72800 }, { month: 'Nov', income: 96500, expenses: 47100 }],
    free: { income: 96500, totalBudgeted: 54000, goalMonthly: 10800, pool: 31700, unbudgetedSpent: 13300, remaining: 18400, usedPct: 42 },
    dailyBurn: 2140, daysLeft: 8, daysInMonth: 30,
    health: { score: 74, label: 'Good', color: '', breakdown: [{ id: 'budgets', name: 'Budget adherence', score: 12, max: 20, pct: 60, tip: '' }] },
    healthDetails: <p>Health details</p>,
    showNetWorth: false,
    brief: { controls: null, body: <p>A quiet weekend so far.</p>, dateSub: 'Sunday, 22 November', action: { text: 'Cook at home tonight', when: 'today' } },
    notices: ['a', 'b', 'c', 'd'].map(k => <div key={k}>Notice {k}</div>),
    budgets: [
        { id: 'b1', category_id: 'food', amount: 6000, spent: 6850, month: 11, year: 2026, category_name: 'Food delivery' },
        { id: 'b2', category_id: 'groc', amount: 8000, spent: 2000, month: 11, year: 2026, category_name: 'Groceries' },
    ] as Budget[],
    transactions: [
        { id: 't1', type: 'expense', amount: 412, description: 'Swiggy', date: today, category_id: 'food', category_name: 'Food delivery' },
    ] as Transaction[],
    ...over,
});

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe('MobileHome', () => {
    it('shows the sections in the approved order: cards, brief, needs attention, budgets, activity', () => {
        render(<MobileHome {...props()} />);
        const order = ['Net this month', 'Brief', 'Needs attention', 'Budgets', 'Activity']
            .map(t => screen.getAllByText(t)[0]);
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        expect(screen.getByText('Free to spend')).toBeInTheDocument();
        expect(screen.getByText('Health score')).toBeInTheDocument();
    });

    it('shows three notices, then the rest on request', () => {
        render(<MobileHome {...props()} />);
        expect(screen.queryByText('Notice d')).toBeNull();
        fireEvent.click(screen.getByText('Show 1 more'));
        expect(screen.getByText('Notice d')).toBeInTheDocument();
    });

    it('keeps the suggested action in the brief and remembers Done', () => {
        const { unmount } = render(<MobileHome {...props()} />);
        fireEvent.click(screen.getByText('Done'));
        expect(screen.getByText('Done: Cook at home tonight')).toBeInTheDocument();
        unmount();
        render(<MobileHome {...props()} />);
        expect(screen.getByText('Done: Cook at home tonight')).toBeInTheDocument();
    });

    it('orders budget rings most used first and opens one with its spending', () => {
        render(<MobileHome {...props()} />);
        const names = screen.getAllByText(/Food delivery|Groceries/, { selector: '.mh-ring-tile span' }).map(el => el.textContent);
        expect(names[0]).toBe('Food delivery');
        expect(screen.getByText('₹850 over')).toBeInTheDocument();
        fireEvent.click(screen.getByText('₹850 over').closest('button')!);
        expect(screen.getByText(/over a ₹6,000 budget/)).toBeInTheDocument();
    });

    it('opens a tapped transaction for editing over the page', () => {
        render(<MobileHome {...props()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Swiggy' }));
        expect(within(screen.getByRole('dialog')).getByText('Editing Swiggy')).toBeInTheDocument();
    });

    it('hides free to spend, the brief and notices for a past month', () => {
        render(<MobileHome {...props({ isCurrentMonth: false, month: 9, brief: null })} />);
        expect(screen.getByText('Net in September')).toBeInTheDocument();
        expect(screen.queryByText('Free to spend')).toBeNull();
        expect(screen.queryByText('Needs attention')).toBeNull();
    });

    it('picks a month from the header', () => {
        const onPickMonth = vi.fn();
        render(<MobileHome {...props({ onPickMonth })} />);
        fireEvent.click(screen.getByRole('button', { name: /November 2026/ }));
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const short = prev.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3);
        fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${short}`) })[0]);
        expect(onPickMonth).toHaveBeenCalledWith(prev.getMonth() + 1, prev.getFullYear());
    });
});
