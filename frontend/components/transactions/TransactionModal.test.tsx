import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionModal } from './TransactionModal';
import { transactionsAPI, creditCardsAPI } from '@/lib/api';

// Integration coverage for the highest-traffic write path in the app. The
// primitives are unit-tested elsewhere; what matters here is the composed
// behaviour -- what actually reaches the API, and the two guards that sit in
// front of it (duplicate detection, and the transfer double-write).

vi.mock('@/lib/api', () => ({
    transactionsAPI: {
        create: vi.fn().mockResolvedValue({ data: {} }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        suggest: vi.fn().mockResolvedValue({ data: { ready: false, trained: 0, category: [], payment_method: [] } }),
        entryContext: vi.fn().mockResolvedValue({ data: { signals: [] } }),
    },
    categoriesAPI: {
        getAll: vi.fn().mockResolvedValue({ data: { categories: [{ id: 'c1', name: 'Food', color: '#f00', icon: '🍔' }] } }),
        create: vi.fn(),
    },
    accountsAPI:    { getAll: vi.fn().mockResolvedValue({ data: { accounts: [
        { id: 1, name: 'HDFC', is_default: true }, { id: 2, name: 'ICICI' },
    ] } }) },
    creditCardsAPI: {
        getAll: vi.fn().mockResolvedValue({ data: { cards: [] } }),
        convertToEmi: vi.fn().mockResolvedValue({ data: { emi: {}, schedule: [] } }),
    },
    goalsAPI:       { getAll: vi.fn().mockResolvedValue({ data: { goals: [] } }) },
    marketDataAPI:  { searchMutualFunds: vi.fn(), getLatestNav: vi.fn() },
    analyticsAPI:   { paymentMethods: vi.fn().mockResolvedValue({ data: { breakdown: [] } }) },
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

describe('classifier suggestions', () => {
    it('shows a model-suggested category chip even when the name does not match, and sends its id', async () => {
        (transactionsAPI.suggest as any).mockResolvedValue({ data: {
            ready: true, trained: 40,
            category: [{ id: 'c1', prob: 0.82 }],
            payment_method: [],
        } });
        const { onSuccess } = open();
        await fillBasics('450', 'Zomato');

        const chip = await waitFor(() => {
            const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Food'));
            expect(el).toBeTruthy();
            return el!;
        });
        fireEvent.click(chip);
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ category_id: 'c1' })
        ));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('auto-applies a confident payment method the user has not touched', async () => {
        (transactionsAPI.suggest as any).mockResolvedValue({ data: {
            ready: true, trained: 40, category: [],
            payment_method: [{ method: 'Cash', prob: 0.9 }],
        } });
        open();
        await fillBasics('120', 'Chai');

        await waitFor(() => expect(document.body.textContent).toContain('usual'));
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_method: 'Cash' })
        ));
    });

    it('ignores a low-confidence payment suggestion', async () => {
        (transactionsAPI.suggest as any).mockResolvedValue({ data: {
            ready: true, trained: 40, category: [],
            payment_method: [{ method: 'Cash', prob: 0.4 }],
        } });
        open();
        await fillBasics('120', 'Chai');
        await waitFor(() => expect(transactionsAPI.suggest).toHaveBeenCalled());
        // Give the resolved promise's .then a tick to run before asserting nothing changed.
        await waitFor(() => expect(document.body.textContent).not.toContain('usual'));
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_method: 'UPI' })
        ));
    });

    it('ignores a stale suggest response that resolves after a newer one', async () => {
        let resolveFirst: (v: any) => void;
        (transactionsAPI.suggest as any)
            .mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }))
            .mockResolvedValueOnce({ data: { ready: true, trained: 40, category: [], payment_method: [{ method: 'Cash', prob: 0.9 }] } });

        open();
        await fillBasics('120', 'Coffee');
        await waitFor(() => expect(transactionsAPI.suggest).toHaveBeenCalledTimes(1));

        // Change the description enough to trigger a second debounced call
        // while the first request is still pending.
        const desc = document.querySelector<HTMLInputElement>('input[type="text"]')!;
        fireEvent.change(desc, { target: { value: 'Chai' } });
        await waitFor(() => expect(transactionsAPI.suggest).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(document.body.textContent).toContain('usual'));

        // Now the slower first request resolves, for the old "Coffee" description.
        resolveFirst!({ data: { ready: true, trained: 40, category: [], payment_method: [{ method: 'UPI', prob: 0.95 }] } });

        // Give every pending microtask AND React's effect scheduling a full
        // real-time window to run. If the guard were broken, this is more
        // than enough time for setMlSuggest -> the payment auto-fill effect
        // -> setForm to have already flipped payment_method back to 'UPI'
        // by now -- a single setTimeout(0) tick was not, which is exactly
        // how the previous version of this test passed even against the bug.
        await new Promise(r => setTimeout(r, 100));

        // Hard assertion, not waitFor: we want to know the state RIGHT NOW,
        // not eventually -- waitFor would keep polling past the moment a
        // buggy cascade lands and could still report a stale pass.
        expect(document.body.textContent).toContain('usual');

        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_method: 'Cash' })
        ));
    });
});

describe('entry feedback', () => {
    it('asks for context once amount is set and shows the top signal under the amount', async () => {
        (transactionsAPI.entryContext as any).mockResolvedValue({ data: { signals: [
            { kind: 'budget_pace', level: 'info', text: '₹6,200 of ₹8,000 Dining budget after this (78%).' },
        ] } });
        open();
        await fillBasics('400', 'Dinner');

        await waitFor(() => expect(screen.getByText('₹6,200 of ₹8,000 Dining budget after this (78%).')).toBeInTheDocument());
        expect(transactionsAPI.entryContext).toHaveBeenCalledWith(expect.objectContaining({
            type: 'expense', amount: 400, description: 'Dinner', payment_method: 'UPI',
        }));
    });

    it('does not ask for context without an amount', async () => {
        open();
        const desc = document.querySelector<HTMLInputElement>('input[type="text"]')!;
        fireEvent.change(desc, { target: { value: 'Dinner' } });
        await new Promise(r => setTimeout(r, 500));
        expect(transactionsAPI.entryContext).not.toHaveBeenCalled();
    });

    it('ignores a stale context response that resolves after a newer one', async () => {
        let resolveFirst: (v: any) => void;
        (transactionsAPI.entryContext as any)
            .mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }))
            .mockResolvedValueOnce({ data: { signals: [{ kind: 'budget_pace', level: 'info', text: 'Fresh signal' }] } });

        open();
        await fillBasics('400', 'Dinner');
        await waitFor(() => expect(transactionsAPI.entryContext).toHaveBeenCalledTimes(1));

        // Change a field enough to trigger a second debounced call while the
        // first request is still pending.
        const desc = document.querySelector<HTMLInputElement>('input[type="text"]')!;
        fireEvent.change(desc, { target: { value: 'Lunch' } });
        await waitFor(() => expect(transactionsAPI.entryContext).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByText('Fresh signal')).toBeInTheDocument());

        // Now the slower first request resolves, for the old "Dinner" key.
        resolveFirst!({ data: { signals: [{ kind: 'duplicate', level: 'warn', text: 'Stale signal' }] } });

        // Give every pending microtask and React's effect scheduling a full
        // real-time window to run -- if the guard were broken, this is more
        // than enough time for the stale response to have overwritten the
        // fresh one by now.
        await new Promise(r => setTimeout(r, 100));

        // Hard assertion, not waitFor: we want the state RIGHT NOW.
        expect(screen.getByText('Fresh signal')).toBeInTheDocument();
        expect(screen.queryByText('Stale signal')).toBeNull();
    });
});

describe('EMI conversion', () => {
    const oneCard = { id: 5, bank_name: 'HDFC', card_name: 'Millennia', last_four: '1234' };

    // Payment method lives in a themed sheet (Modal), not a native <select>,
    // so it's picked by opening the sheet and clicking the row -- same
    // pattern the app itself uses via setPaymentSheetOpen.
    async function selectCreditCardPaymentMethod() {
        const trigger = await waitFor(() => {
            const el = Array.from(document.querySelectorAll<HTMLElement>('div[role="button"]'))
                .find(d => d.textContent?.includes('UPI'));
            expect(el).toBeTruthy();
            return el!;
        });
        fireEvent.click(trigger);
        const cardOption = await waitFor(() => screen.getByRole('button', { name: /credit card/i }));
        fireEvent.click(cardOption);
    }

    function openMoreDetails() {
        fireEvent.click(screen.getByRole('button', { name: /more details/i }));
    }

    it('does not show the EMI section for the default (non-card) payment method', async () => {
        open();
        await fillBasics('1000', 'Laptop');
        openMoreDetails();
        expect(screen.queryByLabelText(/convert to emi/i)).toBeNull();
    });

    it('does not show the EMI section while editing an existing transaction', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [oneCard] } });
        open({ transaction: { id: 't1', type: 'expense', amount: 1000, description: 'Laptop', date: '2026-09-01', payment_method: 'Credit Card', credit_card_id: 5 } });
        await waitFor(() => expect(creditCardsAPI.getAll).toHaveBeenCalled());
        expect(screen.queryByLabelText(/convert to emi/i)).toBeNull();
    });

    it('reveals tenure/interest/fee fields once "Convert to EMI" is toggled on', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [oneCard] } });
        open();
        await fillBasics('1000', 'Laptop');
        openMoreDetails();
        await selectCreditCardPaymentMethod();

        const checkbox = await waitFor(() => screen.getByLabelText(/convert to emi/i));
        expect(screen.queryByPlaceholderText('Tenure (months)')).toBeNull();

        fireEvent.click(checkbox);

        expect(screen.getByPlaceholderText('Tenure (months)')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Interest rate % p.a.')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Processing fee (optional)')).toBeInTheDocument();
        expect(screen.getByLabelText(/no-cost emi/i)).toBeInTheDocument();
    });

    it('syncs is_no_cost with the typed interest rate', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [oneCard] } });
        open();
        await fillBasics('1000', 'Laptop');
        openMoreDetails();
        await selectCreditCardPaymentMethod();
        fireEvent.click(await waitFor(() => screen.getByLabelText(/convert to emi/i)));

        const noCostToggle = screen.getByLabelText(/no-cost emi/i) as HTMLInputElement;
        expect(noCostToggle.checked).toBe(true);
        const rateField = screen.getByPlaceholderText('Interest rate % p.a.') as HTMLInputElement;
        expect(rateField.disabled).toBe(true);

        // Turning off "no-cost" enables the rate field.
        fireEvent.click(noCostToggle);
        expect((screen.getByPlaceholderText('Interest rate % p.a.') as HTMLInputElement).disabled).toBe(false);

        // Typing a non-zero rate keeps no-cost off; typing back to 0 flips it on.
        fireEvent.change(screen.getByPlaceholderText('Interest rate % p.a.'), { target: { value: '13' } });
        expect((screen.getByLabelText(/no-cost emi/i) as HTMLInputElement).checked).toBe(false);

        fireEvent.change(screen.getByPlaceholderText('Interest rate % p.a.'), { target: { value: '0' } });
        expect((screen.getByLabelText(/no-cost emi/i) as HTMLInputElement).checked).toBe(true);
    });

    it('calls creditCardsAPI.convertToEmi (not transactionsAPI.create) with the entered EMI details', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [oneCard] } });
        const { onSuccess } = open();
        await fillBasics('12000', 'New phone');
        openMoreDetails();
        await selectCreditCardPaymentMethod();
        fireEvent.click(await waitFor(() => screen.getByLabelText(/convert to emi/i)));

        fireEvent.change(screen.getByPlaceholderText('Tenure (months)'), { target: { value: '6' } });
        fireEvent.change(screen.getByPlaceholderText('Processing fee (optional)'), { target: { value: '99' } });

        // Several number inputs are visible now (amount, tenure, interest,
        // fee), so the shared submit() helper's unique-spinbutton lookup no
        // longer applies -- submit the form directly instead.
        fireEvent.submit(document.querySelector('form')!);

        await waitFor(() => expect(creditCardsAPI.convertToEmi).toHaveBeenCalledOnce());
        expect(creditCardsAPI.convertToEmi).toHaveBeenCalledWith(5, expect.objectContaining({
            description: 'New phone',
            amount: 12000,
            tenure_months: 6,
            interest_rate_pct: 0,
            is_no_cost: true,
            processing_fee: 99,
        }));
        expect(transactionsAPI.create).not.toHaveBeenCalled();
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('shows a validation error and does not submit when tenure is left blank', async () => {
        (creditCardsAPI.getAll as any).mockResolvedValue({ data: { cards: [oneCard] } });
        open();
        await fillBasics('12000', 'New phone');
        openMoreDetails();
        await selectCreditCardPaymentMethod();
        fireEvent.click(await waitFor(() => screen.getByLabelText(/convert to emi/i)));

        // Tenure left blank. Several number inputs are visible at this point,
        // so submit the form directly rather than via the shared submit()
        // helper (which assumes a single spinbutton).
        fireEvent.submit(document.querySelector('form')!);

        await waitFor(() => expect(screen.getByText(/valid emi tenure/i)).toBeInTheDocument());
        expect(creditCardsAPI.convertToEmi).not.toHaveBeenCalled();
        expect(transactionsAPI.create).not.toHaveBeenCalled();
    });
});
