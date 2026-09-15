import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LoanDetailModal } from './LoanDetailModal';
import { personalLoansAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    personalLoansAPI: { get: vi.fn() },
}));

const loan = {
    id: 'l1', direction: 'lent' as const, counterparty_name: 'Priya',
    principal_amount: '5000.00', repaid_amount: '1000.00', outstanding_amount: '4000.00',
    date_given: '2026-09-01', due_date: '2026-10-01', interest_type: 'none' as const, interest_rate: null, notes: 'For rent',
    status: 'partially_repaid' as const,
};

beforeEach(() => vi.clearAllMocks());

describe('LoanDetailModal', () => {
    it('fetches and displays loan details and repayment history when opened', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan, repayments: [{ id: 'r1', amount: '1000.00', date: '2026-09-15', notes: null }] } });
        render(<LoanDetailModal isOpen loanId="l1" onClose={vi.fn()} onRepay={vi.fn()} />);

        await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument());
        expect(personalLoansAPI.get).toHaveBeenCalledWith('l1');
        expect(screen.getByText('₹4,000')).toBeInTheDocument();
        // ₹1,000 legitimately appears twice: the "Repaid" summary figure and
        // the one repayment row that makes up that total.
        expect(screen.getAllByText('₹1,000')).toHaveLength(2);
    });

    it('shows an empty state when there are no repayments yet', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan: { ...loan, repaid_amount: '0', outstanding_amount: '5000.00', status: 'outstanding' }, repayments: [] } });
        render(<LoanDetailModal isOpen loanId="l1" onClose={vi.fn()} onRepay={vi.fn()} />);
        await waitFor(() => expect(screen.getByText(/no repayments yet/i)).toBeInTheDocument());
    });

    it('calls onRepay with the loaded loan and closes when "Record repayment" is clicked', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan, repayments: [] } });
        const onRepay = vi.fn();
        const onClose = vi.fn();
        render(<LoanDetailModal isOpen loanId="l1" onClose={onClose} onRepay={onRepay} />);
        await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /record repayment/i }));
        expect(onRepay).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('hides the "Record repayment" footer button for a settled loan', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan: { ...loan, status: 'repaid' }, repayments: [] } });
        render(<LoanDetailModal isOpen loanId="l1" onClose={vi.fn()} onRepay={vi.fn()} />);
        await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /record repayment/i })).not.toBeInTheDocument();
    });

    it('does nothing when loanId is null', () => {
        render(<LoanDetailModal isOpen loanId={null} onClose={vi.fn()} onRepay={vi.fn()} />);
        expect(personalLoansAPI.get).not.toHaveBeenCalled();
    });
});
