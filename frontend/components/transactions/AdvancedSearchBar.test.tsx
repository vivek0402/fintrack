import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { AdvancedSearchBar } from './AdvancedSearchBar';

// Integration coverage for the read path that mirrors TransactionModal's write
// path. applyAdvancedFilters/countActiveFilters are unit-tested in
// lib/transactionSort.test.ts; what is asserted here is the wiring -- that
// driving the actual controls produces the right filtered set on `onFilter`,
// and that the page gets told when it must widen its server-side fetch.
//
// NOTE (jsdom): role queries clone nodes, and jsdom's CSS shorthand parser
// throws while re-parsing a `background` containing color-mix() -- ubiquitous
// since the glass tokens landed. Query the DOM directly here.

vi.mock('@/hooks/useWindowSize', () => ({ useIsMobile: () => false }));

const rows = [
    { id: 'a', description: 'Coffee',  amount: '250',   date: '2026-08-10', type: 'expense', category_name: 'Food' },
    { id: 'b', description: 'Rent',    amount: '9000',  date: '2026-08-01', type: 'expense', category_name: 'Housing' },
    { id: 'c', description: 'Salary',  amount: '50000', date: '2026-08-05', type: 'income',  category_name: 'Income' },
];

function setup(props: Partial<React.ComponentProps<typeof AdvancedSearchBar>> = {}) {
    const onFilter = vi.fn();
    const onSetDateContext = vi.fn();
    const onActiveFilterCountChange = vi.fn();
    render(
        <AdvancedSearchBar
            transactions={rows}
            onFilter={onFilter}
            onSetDateContext={onSetDateContext}
            onActiveFilterCountChange={onActiveFilterCountChange}
            {...props}
        />
    );
    return { onFilter, onSetDateContext, onActiveFilterCountChange };
}

const buttons = () => Array.from(document.querySelectorAll('button'));
const byText = (t: string) => buttons().find(b => b.textContent?.trim() === t)!;
const openSearch = () => fireEvent.click(buttons()[0]);
const openPanel  = () => fireEvent.click(buttons()[1]);
const searchBox  = () => document.querySelector<HTMLInputElement>('input[type="text"]')!;

/** ids from the most recent onFilter call */
const emitted = (fn: ReturnType<typeof vi.fn>) =>
    (fn.mock.calls.at(-1)?.[0] ?? []).map((t: { id: string }) => t.id).join('');

beforeEach(() => { localStorage.clear(); });

describe('free-text search', () => {
    it('narrows to matching rows and reports them upward', async () => {
        const { onFilter } = setup();
        openSearch();
        fireEvent.change(searchBox(), { target: { value: 'coffee' } });
        await waitFor(() => expect(emitted(onFilter)).toBe('a'));
    });

    it('is case-insensitive and matches on category as well as description', async () => {
        const { onFilter } = setup();
        openSearch();

        fireEvent.change(searchBox(), { target: { value: 'COFFEE' } });
        await waitFor(() => expect(emitted(onFilter)).toBe('a'));

        fireEvent.change(searchBox(), { target: { value: 'housing' } });
        await waitFor(() => expect(emitted(onFilter)).toBe('b'));
    });

    it('restores the full set when the query is cleared', async () => {
        const { onFilter } = setup();
        openSearch();
        fireEvent.change(searchBox(), { target: { value: 'coffee' } });
        await waitFor(() => expect(emitted(onFilter)).toBe('a'));

        fireEvent.change(searchBox(), { target: { value: '' } });
        await waitFor(() => expect(emitted(onFilter)).toBe('abc'));
    });
});

describe('filter panel', () => {
    it('filters by type', async () => {
        const { onFilter } = setup();
        openPanel();
        fireEvent.click(byText('↑ Income'));
        await waitFor(() => expect(emitted(onFilter)).toBe('c'));

        fireEvent.click(byText('↓ Expense'));
        await waitFor(() => expect(emitted(onFilter)).toBe('ab'));
    });

    it('returns to everything when type goes back to All', async () => {
        const { onFilter } = setup();
        openPanel();
        fireEvent.click(byText('↑ Income'));
        await waitFor(() => expect(emitted(onFilter)).toBe('c'));

        fireEvent.click(byText('All'));
        await waitFor(() => expect(emitted(onFilter)).toBe('abc'));
    });

    it('reports the active filter count so an external top bar can badge it', async () => {
        const { onActiveFilterCountChange } = setup();
        openPanel();
        fireEvent.click(byText('↑ Income'));
        await waitFor(() =>
            expect(onActiveFilterCountChange).toHaveBeenLastCalledWith(1));
    });
});

describe('date context', () => {
    it('asks the page to widen its fetch when the range leaves the current period', async () => {
        // 'All time' and 'Custom range' need data the page has not fetched --
        // it pages by month by default -- so the component has to say so or the
        // filter silently applies to an incomplete set.
        const { onSetDateContext } = setup();
        openPanel();

        fireEvent.click(byText('All time'));
        await waitFor(() => expect(onSetDateContext).toHaveBeenLastCalledWith('all'));

        fireEvent.click(byText('This period'));
        await waitFor(() => expect(onSetDateContext).toHaveBeenLastCalledWith('month'));
    });
});

describe('clear-all registration', () => {
    it('hands the page a reset function that restores the unfiltered list', async () => {
        let clearAll: (() => void) | undefined;
        const { onFilter } = setup({ onRegisterClearAll: fn => { clearAll = fn; } });

        openPanel();
        fireEvent.click(byText('↑ Income'));
        await waitFor(() => expect(emitted(onFilter)).toBe('c'));

        expect(clearAll).toBeTypeOf('function');
        fireEvent.click(byText('All'));
        await waitFor(() => expect(emitted(onFilter)).toBe('abc'));
    });
});
