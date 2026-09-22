import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    creditCardsAPI: { getAll: vi.fn(), payBill: vi.fn() },
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

beforeEach(() => {
    vi.clearAllMocks();
    (accountsAPI.getAll as any).mockResolvedValue({ data: { accounts: [] } });
    (walletsAPI.getAll as any).mockResolvedValue({ data: { wallets: [] } });
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
