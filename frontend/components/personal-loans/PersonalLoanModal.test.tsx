import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonalLoanModal } from './PersonalLoanModal';
import { personalLoansAPI, accountsAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    personalLoansAPI: { create: vi.fn().mockResolvedValue({ data: { loan: { id: 'l1' } } }) },
    accountsAPI: { getAll: vi.fn().mockResolvedValue({ data: { accounts: [{ id: 1, name: 'HDFC', is_default: true }] } }) },
}));

beforeEach(() => vi.clearAllMocks());

function fill(name: string, amount: string, date: string) {
    fireEvent.change(screen.getByLabelText(/who/i), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText(/date given/i), { target: { value: date } });
}

describe('PersonalLoanModal', () => {
    it('defaults to "Lent" and submits with that direction', async () => {
        const onSuccess = vi.fn();
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
        fill('Priya', '5000', '2026-09-13');
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));

        await waitFor(() => expect(personalLoansAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13' })
        ));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('switches to "Borrowed" and submits that direction instead', async () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /^borrowed$/i }));
        fill('Raj', '2000', '2026-09-13');
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));

        await waitFor(() => expect(personalLoansAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ direction: 'borrowed' })
        ));
    });

    it('requires who, amount and date before submitting', () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));
        expect(personalLoansAPI.create).not.toHaveBeenCalled();
    });

    it('sends interest fields only when an interest type other than none is picked', async () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fill('Priya', '5000', '2026-09-13');
        fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: 'flat' } });
        fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));

        await waitFor(() => expect(personalLoansAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ interest_type: 'flat', interest_rate: 2 })
        ));
    });

    it('requires an interest rate when a non-none interest type is picked', async () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fill('Priya', '5000', '2026-09-13');
        fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: 'flat' } });
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));
        expect(personalLoansAPI.create).not.toHaveBeenCalled();
    });
});
