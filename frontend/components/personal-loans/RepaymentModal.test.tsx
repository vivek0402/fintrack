import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RepaymentModal } from './RepaymentModal';
import { personalLoansAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    personalLoansAPI: { addRepayment: vi.fn().mockResolvedValue({ data: { loan: {}, repayment: {} } }) },
}));

const loan = { id: 'l1', counterparty_name: 'Priya', direction: 'lent' as const, outstanding_amount: 4000 };

beforeEach(() => vi.clearAllMocks());

describe('RepaymentModal', () => {
    it('pre-fills the amount with the full outstanding balance', () => {
        render(<RepaymentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} loan={loan} />);
        expect(screen.getByLabelText(/amount/i)).toHaveValue(4000);
    });

    it('submits a partial repayment for the entered amount and date', async () => {
        const onSuccess = vi.fn();
        render(<RepaymentModal isOpen onClose={vi.fn()} onSuccess={onSuccess} loan={loan} />);
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000' } });
        fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-09-14' } });
        fireEvent.click(screen.getByRole('button', { name: /record repayment/i }));

        await waitFor(() => expect(personalLoansAPI.addRepayment).toHaveBeenCalledWith('l1',
            expect.objectContaining({ amount: 1000, date: '2026-09-14' })
        ));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('does not let the amount exceed the outstanding balance', async () => {
        render(<RepaymentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} loan={loan} />);
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '9000' } });
        fireEvent.click(screen.getByRole('button', { name: /record repayment/i }));
        expect(personalLoansAPI.addRepayment).not.toHaveBeenCalled();
        expect(screen.getByText(/exceed/i)).toBeInTheDocument();
    });
});
