import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CreditCardCyclesPage from './page';
import { creditCardsAPI } from '@/lib/api';

const push = vi.fn();
let searchParams = new URLSearchParams({ id: '7' });

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => searchParams,
}));

vi.mock('@/store/authStore', () => ({
    useAuthStore: () => ({
        user: { id: 'u1', currency: 'INR' },
        isLoading: false,
        loadFromStorage: vi.fn(),
    }),
}));

vi.mock('@/lib/api', () => ({
    creditCardsAPI: { getCycles: vi.fn() },
}));

const getCycles = creditCardsAPI.getCycles as ReturnType<typeof vi.fn>;

const cycles = [
    { start: '2026-09-06', end: null, label: 'Sep 6 – present', total: '4500.00', is_current: true },
    { start: '2026-08-06', end: '2026-09-05', label: 'Aug 6 – Sep 5', total: '12300.50', is_current: false },
];

beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams({ id: '7' });
    getCycles.mockResolvedValue({ data: { cycles } });
});

describe('CreditCardCyclesPage', () => {
    it('renders the cycle list with the current cycle first and visually distinguished', async () => {
        render(<CreditCardCyclesPage />);
        expect(await screen.findByText('Sep 6 – present')).toBeInTheDocument();
        expect(screen.getByText('Aug 6 – Sep 5')).toBeInTheDocument();
        expect(screen.getByText('Current')).toBeInTheDocument();

        const rows = screen.getAllByRole('button').filter(b => b.textContent?.includes('–'));
        // Current cycle row renders first in DOM order.
        expect(rows[0].textContent).toContain('Sep 6 – present');
    });

    it('formats each cycle total with the shared currency formatter, prefixed with a sign', async () => {
        render(<CreditCardCyclesPage />);
        expect(await screen.findByText('+₹4,500')).toBeInTheDocument();
        expect(screen.getByText('+₹12,301')).toBeInTheDocument();
    });

    it('shows a credit-balance (negative) cycle total with a minus sign, not a bare positive amount', async () => {
        // A mid-cycle bill payment (income-type) that exceeds that cycle's
        // charges makes the backend's total go negative -- a real credit, not
        // debt. Math.abs() inside fmt() would otherwise silently drop the sign.
        getCycles.mockResolvedValue({
            data: {
                cycles: [
                    { start: '2026-09-06', end: null, label: 'Sep 6 – present', total: '-500.00', is_current: true },
                ],
            },
        });
        render(<CreditCardCyclesPage />);
        const amount = await screen.findByText('−₹500');
        expect(amount).toBeInTheDocument();
        // Mirrors the Accounts page's new_charges_since_statement convention:
        // a non-positive amount uses the neutral text color, not the warn color
        // reserved for a positive (owed) total.
        expect(amount).toHaveStyle({ color: 'var(--text-primary)' });
    });

    it('shows a positive (owed) cycle total with a plus sign and the warn color', async () => {
        getCycles.mockResolvedValue({
            data: {
                cycles: [
                    { start: '2026-09-06', end: null, label: 'Sep 6 – present', total: '500.00', is_current: true },
                ],
            },
        });
        render(<CreditCardCyclesPage />);
        const amount = await screen.findByText('+₹500');
        expect(amount).toBeInTheDocument();
        expect(amount).toHaveStyle({ color: 'var(--color-warn)' });
    });

    it('shows a loading state before the fetch resolves', async () => {
        let resolve: (v: any) => void = () => {};
        getCycles.mockReturnValue(new Promise(r => { resolve = r; }));
        render(<CreditCardCyclesPage />);
        expect(screen.queryByText('Sep 6 – present')).not.toBeInTheDocument();
        resolve({ data: { cycles } });
        await screen.findByText('Sep 6 – present');
    });

    it('shows an error state when the fetch fails', async () => {
        getCycles.mockRejectedValue(new Error('network down'));
        render(<CreditCardCyclesPage />);
        expect(await screen.findByText("Couldn't load billing cycles")).toBeInTheDocument();
    });

    it('shows the empty state when there are no cycles', async () => {
        getCycles.mockResolvedValue({ data: { cycles: [] } });
        render(<CreditCardCyclesPage />);
        expect(await screen.findByText('No billing cycles yet')).toBeInTheDocument();
    });

    it('shows an error state for a non-numeric card id without calling the API', async () => {
        searchParams = new URLSearchParams({ id: 'abc' });
        render(<CreditCardCyclesPage />);
        expect(await screen.findByText("Couldn't load billing cycles")).toBeInTheDocument();
        expect(getCycles).not.toHaveBeenCalled();
    });

    it('navigates a closed cycle with both from and to', async () => {
        render(<CreditCardCyclesPage />);
        const row = await screen.findByText('Aug 6 – Sep 5');
        fireEvent.click(row.closest('button')!);
        expect(push).toHaveBeenCalledWith('/transactions?credit_card_id=7&from=2026-08-06&to=2026-09-05');
    });

    it('navigates the current cycle with from only, no to', async () => {
        render(<CreditCardCyclesPage />);
        const row = await screen.findByText('Sep 6 – present');
        fireEvent.click(row.closest('button')!);
        expect(push).toHaveBeenCalledWith('/transactions?credit_card_id=7&from=2026-09-06');
    });
});
