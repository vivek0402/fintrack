import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BulkOpsPanel } from './BulkOpsPanel';
import { transactionsAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

vi.mock('@/lib/api', () => ({
    transactionsAPI: { delete: vi.fn().mockResolvedValue({}) },
    categoriesAPI: { getAll: vi.fn().mockResolvedValue({ data: { categories: [] } }) },
}));

vi.mock('@/store/toastStore', () => ({
    toast: { undo: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const UNDO_WINDOW_MS = 4200;

function renderPanel(overrides: Partial<React.ComponentProps<typeof BulkOpsPanel>> = {}) {
    const props = {
        selectedIds: new Set(['tx-1', 'tx-2']),
        allTransactions: [
            { id: 'tx-1', description: 'Coffee' },
            { id: 'tx-2', description: 'Groceries' },
        ],
        currency: 'INR',
        selectedYear: 2026,
        selectedMonth: 8,
        onSelectAll: vi.fn(),
        onExit: vi.fn(),
        onRefresh: vi.fn(),
        onRemoveIds: vi.fn(),
        onPendingDeleteChange: vi.fn(),
        ...overrides,
    };
    render(<BulkOpsPanel {...props} />);
    return props;
}

function confirmBulkDelete() {
    fireEvent.click(screen.getByTitle('Delete selected'));
    fireEvent.click(screen.getByText(/^Delete 2$/));
}

describe('BulkOpsPanel bulk delete', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        (transactionsAPI.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('optimistically hides rows and shows an undo toast immediately', () => {
        const props = renderPanel();
        confirmBulkDelete();

        expect(props.onPendingDeleteChange).toHaveBeenCalledTimes(1);
        const updater = (props.onPendingDeleteChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(updater(new Set())).toEqual(new Set(['tx-1', 'tx-2']));
        expect(props.onExit).toHaveBeenCalled();
        expect(toast.undo).toHaveBeenCalledWith(expect.stringContaining('Deleted 2'), expect.any(Function));
        expect(transactionsAPI.delete).not.toHaveBeenCalled();
    });

    it('commits the delete after the undo window elapses', async () => {
        const props = renderPanel();
        confirmBulkDelete();

        await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS); });

        expect(transactionsAPI.delete).toHaveBeenCalledWith('tx-1');
        expect(transactionsAPI.delete).toHaveBeenCalledWith('tx-2');
        expect(props.onRemoveIds).toHaveBeenCalledWith(['tx-1', 'tx-2']);
        expect(props.onRefresh).toHaveBeenCalled();
    });

    it('cancels the delete when undo is clicked before the window elapses', async () => {
        const props = renderPanel();
        confirmBulkDelete();

        // Simulate the user clicking "Undo" on the toast -- the component
        // passes its cancel callback as toast.undo's second argument.
        const onUndo = (toast.undo as ReturnType<typeof vi.fn>).mock.calls[0][1] as () => void;
        onUndo();

        await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS); });

        expect(transactionsAPI.delete).not.toHaveBeenCalled();
        expect(props.onRemoveIds).not.toHaveBeenCalled();
    });

    it('reports an error and still refreshes if the delete call fails', async () => {
        (transactionsAPI.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
        const props = renderPanel();
        confirmBulkDelete();

        await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS); });

        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('failed'));
        expect(props.onRefresh).toHaveBeenCalled();
    });
});
