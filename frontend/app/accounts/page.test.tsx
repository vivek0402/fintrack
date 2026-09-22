import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AccountsPage from './page';
import { accountsAPI, creditCardsAPI, walletsAPI } from '@/lib/api';

// Focuses on the new "Cycles" button's gating condition only -- the rest of
// this page's behavior (modals, CRUD) is unchanged and untested here.

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
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
    accountsAPI: { getAll: vi.fn() },
    creditCardsAPI: { getAll: vi.fn(), payBill: vi.fn(), getCycles: vi.fn() },
    walletsAPI: { getAll: vi.fn() },
}));

const cardWithStatement = {
    id: 1, bank_name: 'HDFC', card_name: 'Millennia', last_four: '1234',
    credit_limit: 100000, outstanding_balance: 5000, current_outstanding_balance: 5000,
    balance_as_of: null, billing_date: 5, due_days: 20, network: 'Visa', color: '#6366f1',
    interest_rate_pct: null,
    statement_balance: 4500, new_charges_since_statement: 500,
    last_statement_close_date: '2026-09-05', statement_due_date: '2026-09-25',
};

const cardWithoutStatement = {
    ...cardWithStatement, id: 2, bank_name: 'ICICI', card_name: 'Amazon Pay',
    billing_date: null, statement_balance: null, new_charges_since_statement: null,
    last_statement_close_date: null, statement_due_date: null,
};

const bank = { id: 9, name: 'HDFC Savings', icon: '', color: '', account_type: 'Savings', last_four: null, starting_balance: 10000, current_balance: 10000, is_default: true, balance_as_of: null };

const cycles = [
    { start: '2026-09-06', end: null, label: 'Sep 6 – present', total: '1200.00', is_current: true },
    { start: '2026-08-06', end: '2026-09-05', label: 'Aug 6 – Sep 5', total: '4500.00', is_current: false },
    { start: '2026-07-06', end: '2026-08-05', label: 'Jul 6 – Aug 5', total: '0.00', is_current: false },
];

beforeEach(() => {
    vi.clearAllMocks();
    (accountsAPI.getAll as any).mockResolvedValue({ data: { accounts: [] } });
    (walletsAPI.getAll as any).mockResolvedValue({ data: { wallets: [] } });
    (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles: [] } });
});

describe('Accounts page — Cycles button', () => {
    it('shows the Cycles button when the card has a statement balance (billing_date set)', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [cardWithStatement] } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());
        expect(screen.getByText('Cycles')).toBeInTheDocument();
    });

    it('hides the Cycles button when the card has no billing date / statement balance', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [cardWithoutStatement] } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('ICICI Amazon Pay')).toBeInTheDocument());
        expect(screen.queryByText('Cycles')).not.toBeInTheDocument();
    });
});

describe('Accounts page — Pay Bill modal', () => {
    beforeEach(() => {
        (accountsAPI.getAll as any).mockResolvedValue({ data: { accounts: [bank] } });
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [cardWithStatement] } });
    });

    it('defaults the Cycle to the most recent closed (owed) cycle and prefills its amount', async () => {
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(creditCardsAPI.getCycles).toHaveBeenCalledWith(1));
        await waitFor(() => expect(screen.getByText('Aug 6 – Sep 5')).toBeInTheDocument());
        expect(screen.getByDisplayValue('4500.00')).toBeInTheDocument();
    });

    it('does not render a Cycle field for a card with no billing date (no cycles)', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [cardWithoutStatement] } });
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles: [] } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('ICICI Amazon Pay')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(screen.getByText(/Pay ICICI Amazon Pay/)).toBeInTheDocument());
        expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
    });

    it('submits the selected Pay by method to creditCardsAPI.payBill', async () => {
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles } });
        (creditCardsAPI.payBill as any).mockResolvedValue({ data: {} });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(screen.getByDisplayValue('4500.00')).toBeInTheDocument());

        fireEvent.click(screen.getByText('📱 UPI'));
        await waitFor(() => expect(screen.getByText('Cash')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Cash'));

        fireEvent.click(screen.getByText(/^Pay ₹/));
        await waitFor(() => expect(creditCardsAPI.payBill).toHaveBeenCalledWith(1, expect.objectContaining({ payment_method: 'Cash' })));
    });

    it('does not show a "change" account link when there is only one bank account', async () => {
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(screen.getByText(/from/)).toBeInTheDocument());
        expect(screen.queryByText('change')).not.toBeInTheDocument();
    });
});
