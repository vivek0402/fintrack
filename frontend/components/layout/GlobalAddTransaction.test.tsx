import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const modal = vi.fn();
vi.mock('@/components/transactions/TransactionModal', () => ({
    TransactionModal: (p: { isOpen: boolean; onClose: () => void }) => {
        modal(p.isOpen);
        return p.isOpen ? <button onClick={p.onClose}>modal-open</button> : null;
    },
}));

import { GlobalAddTransaction } from './GlobalAddTransaction';
import { requestAddTransaction } from '@/lib/addTransactionEvent';

describe('GlobalAddTransaction', () => {
    beforeEach(() => { modal.mockClear(); window.history.replaceState(null, '', '/dashboard'); });

    it('opens over the current page without navigating', () => {
        render(<GlobalAddTransaction />);
        expect(screen.queryByText('modal-open')).toBeNull();
        act(() => requestAddTransaction());
        expect(screen.getByText('modal-open')).toBeTruthy();
        expect(window.location.pathname).toBe('/dashboard');
    });

    it('stays closed on /transactions, which hosts its own dialog', () => {
        window.history.replaceState(null, '', '/transactions');
        render(<GlobalAddTransaction />);
        act(() => requestAddTransaction());
        expect(screen.queryByText('modal-open')).toBeNull();
    });
});
