import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithQuery as render } from '@/lib/test-utils';
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
    creditCardsAPI: { getAll: vi.fn(), payBill: vi.fn(), getCycles: vi.fn(), paymentCandidates: vi.fn(), undoPay: vi.fn() },
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
    (creditCardsAPI.paymentCandidates as any).mockResolvedValue({ data: { candidates: [] } });
    (creditCardsAPI.undoPay as any).mockResolvedValue({ data: {} });
    localStorage.clear();
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

    it('prefills what is still owed on the last statement, not the cycle net total', async () => {
        // Previous bill paid mid-cycle: the closed cycle nets to 2,000 but
        // 12,000 was billed and nothing has been paid since the close.
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [{
            ...cardWithStatement, statement_balance: 12000, statement_amount_due: 12000, statement_paid: 0, statement_remaining: 12000,
        }] } });
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles: [cycles[0], { ...cycles[1], total: '2000.00' }, cycles[2]] } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(screen.getByDisplayValue('12000')).toBeInTheDocument());
    });

    it('prefills the exact paise owed (8000.4), not a rupee-rounded 8000', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [{
            ...cardWithStatement, statement_balance: 8000.4, statement_amount_due: 8000.4, statement_paid: 0, statement_remaining: 8000.4,
        }] } });
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(screen.getByDisplayValue('8000.4')).toBeInTheDocument());
    });

    it('shows the statement amount due (EMI principal excluded) on the card and in the modal', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [{
            ...cardWithStatement, statement_balance: 11000, emi_blocked_principal: 3000,
            statement_amount_due: 8000, statement_paid: 0, statement_remaining: 8000,
        }] } });
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());
        expect(screen.getAllByText(/8,000/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/11,000/)).not.toBeInTheDocument();
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

describe('Accounts page — Which cycle? picker (honest amounts)', () => {
    const owedCard = {
        ...cardWithStatement, statement_balance: 12000, statement_amount_due: 12000,
        statement_paid: 4000, statement_remaining: 8000, new_charges_since_statement: -2800,
    };
    const billedCycles = [
        cycles[0],
        { ...cycles[1], total: '2000.00', statement_close_date: '2026-09-06', statement_balance: 12000 },
        { ...cycles[2], total: '0.00', statement_close_date: '2026-08-06', statement_balance: 9500 },
    ];

    beforeEach(() => {
        (accountsAPI.getAll as any).mockResolvedValue({ data: { accounts: [bank] } });
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [owedCard] } });
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles: billedCycles } });
    });

    async function openPicker() {
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Pay Bill'));
        await waitFor(() => expect(screen.getByDisplayValue('8000')).toBeInTheDocument());
    }

    it('the Cycle trigger shows the selected row\'s amount and caption, not the cycle net total', async () => {
        await openPicker();
        const trigger = screen.getByTestId('cycle-trigger-amount');
        expect(trigger).toHaveTextContent('₹8,000');
        expect(trigger).toHaveTextContent('of ₹12,000 left');
        expect(trigger).not.toHaveTextContent('2,000left');
    });

    it('renders current / latest / older rows with their own figure, caption and status', async () => {
        await openPicker();
        fireEvent.click(screen.getByText('Aug 6 – Sep 5'));
        await waitFor(() => expect(screen.getByText('Which cycle?')).toBeInTheDocument());

        const current = screen.getByTestId('cycle-row-0');
        expect(current).toHaveTextContent('Not billed yet');
        expect(current).toHaveTextContent('₹1,200'); // -2,800 net + 4,000 paid
        expect(current).toHaveTextContent('new charges');
        expect(current).not.toBeDisabled();

        const latest = screen.getByTestId('cycle-row-1');
        expect(latest).toHaveTextContent('₹8,000');
        expect(latest).toHaveTextContent('of ₹12,000 left');
        expect(latest).toHaveTextContent(/^.*Due/);

        const older = screen.getByTestId('cycle-row-2');
        expect(older).toHaveTextContent('₹9,500');
        expect(older).toHaveTextContent('billed');
        expect(older).toHaveTextContent('Carried into the next statement');
        expect(older).toBeDisabled();

        expect(screen.getByText(/Older statements can't be paid separately/)).toBeInTheDocument();
    });

    it('picking the current cycle pre-fills its new charges and the trigger follows', async () => {
        await openPicker();
        fireEvent.click(screen.getByText('Aug 6 – Sep 5'));
        await waitFor(() => expect(screen.getByTestId('cycle-row-0')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('cycle-row-0'));

        await waitFor(() => expect(screen.getByDisplayValue('1200')).toBeInTheDocument());
        const trigger = screen.getByTestId('cycle-trigger-amount');
        expect(trigger).toHaveTextContent('₹1,200');
        expect(trigger).toHaveTextContent('new charges');
    });

    it('an older statement cannot be picked: amount and selection stay on the latest statement', async () => {
        await openPicker();
        fireEvent.click(screen.getByText('Aug 6 – Sep 5'));
        await waitFor(() => expect(screen.getByTestId('cycle-row-2')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('cycle-row-2'));

        expect(screen.getByDisplayValue('8000')).toBeInTheDocument();
        expect(screen.getByTestId('cycle-trigger-amount')).toHaveTextContent('of ₹12,000 left');
    });
});

describe('Accounts page — bills paid outside the app', () => {
    // May, Jun and Jul paid from the bank but never recorded (own charges
    // 5,700 / 4,100 / 2,600); the latest statement looks like 24,100 due.
    const chainCard = {
        ...cardWithStatement, billing_date: 15, due_days: 20,
        statement_balance: 24100, statement_amount_due: 24100, statement_paid: 0, statement_remaining: 24100,
        current_outstanding_balance: 42310, last_statement_close_date: '2026-09-15', statement_due_date: '2026-10-05',
    };
    const chain = [
        { start: '2026-09-16', end: null, label: 'Sep 16 – present', total: '18210.00', is_current: true, payments: 0 },
        { start: '2026-08-16', end: '2026-09-15', label: 'Aug 16 – Sep 15', total: '11700.00', is_current: false, statement_close_date: '2026-09-15', statement_balance: 24100, payments: 0 },
        { start: '2026-07-16', end: '2026-08-15', label: 'Jul 16 – Aug 15', total: '2600.00', is_current: false, statement_close_date: '2026-08-15', statement_balance: 12400, payments: 0 },
        { start: '2026-06-16', end: '2026-07-15', label: 'Jun 16 – Jul 15', total: '4100.00', is_current: false, statement_close_date: '2026-07-15', statement_balance: 9800, payments: 0 },
        { start: '2026-05-16', end: '2026-06-15', label: 'May 16 – Jun 15', total: '5700.00', is_current: false, statement_close_date: '2026-06-15', statement_balance: 5700, payments: 0 },
    ];

    beforeEach(() => {
        (accountsAPI.getAll as any).mockResolvedValue({ data: { accounts: [bank] } });
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [chainCard] } });
        (creditCardsAPI.getCycles as any).mockResolvedValue({ data: { cycles: chain } });
        (creditCardsAPI.payBill as any).mockResolvedValue({ data: {} });
    });

    async function openPay() {
        render(<AccountsPage />);
        await waitFor(() => expect(screen.getByText('HDFC Millennia')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Pay Bill'));
        return screen.findByTestId('unpaid-nudge');
    }

    it('flags the unpaid statements and Review picks the oldest, on its due date', async () => {
        const nudge = await openPay();
        expect(nudge).toHaveTextContent('3 older statements look unpaid');
        fireEvent.click(nudge);
        await waitFor(() => expect(screen.getByDisplayValue('5700')).toBeInTheDocument());
        expect(screen.getByText('May 16 – Jun 15')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Record ₹5,700 as paid' })).toBeInTheDocument();
        expect(screen.getByTestId('pay-effect')).toHaveTextContent('₹24,100 → ₹18,400');
    });

    it('records both sides by default, on the statement due date', async () => {
        fireEvent.click(await openPay());
        fireEvent.click(await screen.findByRole('button', { name: 'Record ₹5,700 as paid' }));
        await waitFor(() => expect(creditCardsAPI.payBill).toHaveBeenCalledTimes(1));
        expect(creditCardsAPI.payBill).toHaveBeenCalledWith(1, expect.objectContaining({ bank_account_id: 9, amount: 5700, date: '2026-07-05' }));
    });

    it('"Card side only" records just the card side, without a bank account', async () => {
        fireEvent.click(await openPay());
        fireEvent.click(await screen.findByTestId('choice-card'));
        expect(screen.getByText(/bank balance in the app won't change/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Record ₹5,700 as paid' }));
        await waitFor(() => expect(creditCardsAPI.payBill).toHaveBeenCalledTimes(1));
        const [, body] = (creditCardsAPI.payBill as any).mock.calls[0];
        expect(body).toMatchObject({ card_only: true, amount: 5700 });
        expect(body).not.toHaveProperty('bank_account_id');
    });

    it('Record all: one payment per statement, oldest first, each on its own due date', async () => {
        await openPay();
        fireEvent.click(screen.getByText('Aug 16 – Sep 15'));        // open the picker
        fireEvent.click(await screen.findByTestId('record-all'));
        expect(screen.getByText('3 older statements')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Record ₹12,400 as paid' }));
        await waitFor(() => expect(creditCardsAPI.payBill).toHaveBeenCalledTimes(3));
        const calls = (creditCardsAPI.payBill as any).mock.calls.map(([, b]: [number, any]) => [b.amount, b.date]);
        expect(calls).toEqual([[5700, '2026-07-05'], [4100, '2026-08-04'], [2600, '2026-09-04']]);
    });

    it('finds the bank debit, preselects a strong match, and links it instead of adding a debit', async () => {
        (creditCardsAPI.paymentCandidates as any).mockResolvedValue({ data: { candidates: [
            { id: 'bank-tx', amount: 5700, date: '2026-07-04', description: 'CC PAYMENT HDFC MILLENNIA', account_name: 'HDFC Savings', score: 5, reason: 'Same amount · card in description' },
        ] } });
        (creditCardsAPI.payBill as any).mockResolvedValue({ data: { transactions: [{ id: 'bank-tx' }, { id: 'card-tx', credit_card_id: 1 }], linked_transaction_id: 'bank-tx' } });
        fireEvent.click(await openPay());
        const match = await screen.findByTestId('choice-link-bank-tx');
        expect(match).toHaveAttribute('aria-checked', 'true');
        expect(match).toHaveTextContent('Best match');
        // Searched around May's statement: day after its close to a week after its due date.
        expect(creditCardsAPI.paymentCandidates).toHaveBeenCalledWith(1, { from: '2026-06-16', to: '2026-07-12', amount: 5700, due: '2026-07-05' });
        fireEvent.click(screen.getByRole('button', { name: 'Link and record as paid' }));
        await waitFor(() => expect(creditCardsAPI.payBill).toHaveBeenCalledWith(1, { link_transaction_id: 'bank-tx', payment_method: 'UPI' }));
    });

    it('Undo reverses a linked payment, keeping the bank debit', async () => {
        (creditCardsAPI.paymentCandidates as any).mockResolvedValue({ data: { candidates: [
            { id: 'bank-tx', amount: 5700, date: '2026-07-04', description: 'CC PAYMENT HDFC', account_name: 'HDFC Savings', score: 5, reason: 'x' },
        ] } });
        (creditCardsAPI.payBill as any).mockResolvedValue({ data: { transactions: [{ id: 'bank-tx' }, { id: 'card-tx', credit_card_id: 1 }], linked_transaction_id: 'bank-tx' } });
        fireEvent.click(await openPay());
        await screen.findByTestId('choice-link-bank-tx');
        fireEvent.click(screen.getByRole('button', { name: 'Link and record as paid' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
        await waitFor(() => expect(creditCardsAPI.undoPay).toHaveBeenCalledWith(1, { card_transaction_id: 'card-tx', unlink_transaction_id: 'bank-tx' }));
    });

    it('"Not paid" stops a statement being suggested and can be reversed', async () => {
        await openPay();
        fireEvent.click(screen.getByText('Aug 16 – Sep 15'));
        fireEvent.click(await screen.findByTestId('not-paid-4'));     // May
        expect(screen.getByTestId('cycle-row-4')).toBeDisabled();
        expect(screen.getByTestId('cycle-row-4')).toHaveTextContent('You said not paid');
        expect(screen.getByTestId('record-all')).toHaveTextContent('Record all 2 as paid');
        fireEvent.click(screen.getByTestId('not-paid-4'));            // Ask me again
        expect(screen.getByTestId('cycle-row-4')).not.toBeDisabled();
    });

    it('Record all: a failure part-way offers Retry for the rest', async () => {
        (creditCardsAPI.payBill as any)
            .mockResolvedValueOnce({ data: { transactions: [{ id: 'c1', credit_card_id: 1 }] } })
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValue({ data: { transactions: [{ id: 'c2', credit_card_id: 1 }] } });
        await openPay();
        fireEvent.click(screen.getByText('Aug 16 – Sep 15'));
        fireEvent.click(await screen.findByTestId('record-all'));
        fireEvent.click(screen.getByRole('button', { name: 'Record ₹12,400 as paid' }));
        expect(await screen.findByText("Recorded 1 of 3. The rest didn't save.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(creditCardsAPI.payBill).toHaveBeenCalledTimes(4));
        const amounts = (creditCardsAPI.payBill as any).mock.calls.map(([, b]: [number, any]) => b.amount);
        expect(amounts).toEqual([5700, 4100, 4100, 2600]);
    });

    it('the card itself says when statements look unpaid, and Review opens Pay Bill on the oldest', async () => {
        render(<AccountsPage />);
        const note = await screen.findByTestId('card-unpaid-note-1');
        expect(note).toHaveTextContent('3 older statements look unpaid. Already paid?');
        fireEvent.click(note);
        await waitFor(() => expect(screen.getByDisplayValue('5700')).toBeInTheDocument());
        expect(screen.getByText('May 16 – Jun 15')).toBeInTheDocument();
    });
});
