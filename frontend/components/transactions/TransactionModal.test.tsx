import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionModal } from './TransactionModal';
import { transactionsAPI } from '@/lib/api';

// Integration coverage for the highest-traffic write path in the app. The
// primitives are unit-tested elsewhere; what matters here is the composed
// behaviour -- what actually reaches the API, and the two guards that sit in
// front of it (duplicate detection, and the transfer double-write).

vi.mock('@/lib/api', () => ({
    transactionsAPI: {
        create: vi.fn().mockResolvedValue({ data: {} }),
        update: vi.fn().mockResolvedValue({ data: {} }),
    },
    categoriesAPI: {
        getAll: vi.fn().mockResolvedValue({ data: { categories: [{ id: 'c1', name: 'Food', color: '#f00', icon: '🍔' }] } }),
        create: vi.fn(),
    },
    accountsAPI:    { getAll: vi.fn().mockResolvedValue({ data: { accounts: [
        { id: 1, name: 'HDFC', is_default: true }, { id: 2, name: 'ICICI' },
    ] } }) },
    creditCardsAPI: { getAll: vi.fn().mockResolvedValue({ data: { cards: [] } }) },
    goalsAPI:       { getAll: vi.fn().mockResolvedValue({ data: { goals: [] } }) },
    marketDataAPI:  { searchMutualFunds: vi.fn(), getLatestNav: vi.fn() },
}));

vi.mock('@/store/toastStore', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), undo: vi.fn() },
}));

vi.mock('@/store/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1', currency: 'INR' } }),
}));

// NOTE (jsdom): getAllByRole clones nodes internally, and jsdom's CSS shorthand
// parser throws on a `background` shorthand containing color-mix() while
// cloning. Since the glass tokens made color-mix ubiquitous, role queries can
// crash on some subtrees -- query the DOM directly there instead.

function open(props: Partial<React.ComponentProps<typeof TransactionModal>> = {}) {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
        <TransactionModal isOpen onClose={onClose} onSuccess={onSuccess} {...props} />
    );
    return { onSuccess, onClose };
}

// The amount field is the only spinbutton in the default (collapsed) form.
const amountField = () => screen.getByRole('spinbutton');
const submit = () => fireEvent.submit(amountField().closest('form')!);

async function fillBasics(amount = '250', description = 'Coffee') {
    fireEvent.change(amountField(), { target: { value: amount } });
    // The description placeholder changes with the selected type, so match on
    // role rather than pinning one type's copy.
    const desc = document.querySelector<HTMLInputElement>('input[type="text"]')!;
    fireEvent.change(desc, { target: { value: description } });
}

// The From/To selects are rendered from fetched accounts, so they appear only
// after accountsAPI.getAll() resolves.
async function transferSelects() {
    await waitFor(() => expect(document.querySelectorAll('select').length).toBeGreaterThanOrEqual(2));
    return Array.from(document.querySelectorAll('select'));
}

beforeEach(() => { vi.clearAllMocks(); });

describe('add transaction', () => {
    it('sends the entered amount and description to the API', async () => {
        const { onSuccess } = open();
        await fillBasics('250', 'Coffee');
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledOnce());
        expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 250, description: 'Coffee', type: 'expense' })
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('picks a category through the dialog and sends its id', async () => {
        // The category field is a dialog now, not an inline dropdown: open it,
        // search, then select. What matters is that category_id still reaches
        // the API unchanged. Queried through the DOM rather than by role, per
        // the jsdom/color-mix note above.
        const { onSuccess } = open();
        await fillBasics('250', 'Coffee');

        const trigger = document.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
        expect(trigger).toHaveTextContent('Choose');
        fireEvent.click(trigger);

        const search = await waitFor(() =>
            document.querySelector<HTMLInputElement>('input[aria-label="Search categories"]')!
        );
        fireEvent.change(search, { target: { value: 'foo' } });

        // Two rows: the match, plus the inline "Create" offer allowCreate adds
        // when nothing matches exactly.
        const option = await waitFor(() => {
            const els = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
            expect(els).toHaveLength(2);
            const hit = els.find(e => e.textContent?.includes('Food'));
            expect(hit).toBeTruthy();
            return hit!;
        });
        fireEvent.click(option);

        // Dialog closes, and the trigger carries the selection.
        await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull());
        expect(document.querySelector('[aria-haspopup="listbox"]')).toHaveTextContent('Food');

        submit();
        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledOnce());
        expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ category_id: 'c1' })
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('defaults to expense and can switch to income', async () => {
        open();
        await fillBasics('900', 'Refund');
        fireEvent.click(screen.getByRole('button', { name: /income/i }));
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledOnce());
        expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'income' })
        );
    });
});

describe('transfer', () => {
    it('writes two rows -- an expense out and an income in -- both tagged transfer', async () => {
        // A transfer is not one row with a type; it is a matched pair, and the
        // `transfer` tag is what keeps both out of real spending and income
        // (see isNonSavingsExpense / isRealIncome).
        open();
        fireEvent.click(screen.getByRole('button', { name: /transfer/i }));
        await fillBasics('5000', 'Move to savings');

        const selects = await transferSelects();
        fireEvent.change(selects[0], { target: { value: '1' } });
        fireEvent.change(selects[1], { target: { value: '2' } });
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledTimes(2));
        const [first, second] = (transactionsAPI.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(first[0]).toMatchObject({ type: 'expense', tags: expect.arrayContaining(['transfer']) });
        expect(second[0]).toMatchObject({ type: 'income', tags: expect.arrayContaining(['transfer']) });
    });

    it('keeps the source account out of the destination list', async () => {
        // handleSubmit still carries a "From and To must differ" guard, but the
        // UI makes it unreachable: the To select is built from accounts minus
        // whichever one From holds. Asserting the reachable behaviour rather
        // than the defensive branch, so this test tracks what users can do.
        open();
        fireEvent.click(screen.getByRole('button', { name: /transfer/i }));
        await fillBasics('5000', 'Move');

        const [from, to] = await transferSelects();
        fireEvent.change(from, { target: { value: '1' } });

        const toOptions = Array.from(to.querySelectorAll('option')).map(o => o.value);
        expect(toOptions).not.toContain('1');
        expect(toOptions).toContain('2');
    });
});
