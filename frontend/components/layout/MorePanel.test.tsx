import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery as render, createTestQueryClient } from '@/lib/test-utils';

vi.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/api', () => ({
    budgetsAPI: { getAll: vi.fn().mockResolvedValue({ data: { budgets: [
        { id: 'b1', amount: '1000', spent: '1500' }, { id: 'b2', amount: '1000', spent: '200' },
    ] } }) },
    goalsAPI: { getAll: vi.fn().mockResolvedValue({ data: { goals: [
        { id: 'g1', saved_amount: '95', target_amount: '100' }, { id: 'g2', saved_amount: '10', target_amount: '100' },
    ] } }) },
    accountsAPI: { getAll: vi.fn().mockResolvedValue({ data: { accounts: [{ id: 1 }, { id: 2 }, { id: 3 }] } }) },
    transactionsAPI: {}, analyticsAPI: {}, recurringAPI: {}, creditCardsAPI: {},
}));

import { MorePanel } from './MorePanel';
import { budgetsAPI } from '@/lib/api';

const base = { closing: false, isActive: (h: string) => h === '/budgets', onNavigate: vi.fn(), onClose: vi.fn(), handleRef: { current: null } };

beforeEach(() => vi.clearAllMocks());

describe('MorePanel', () => {
    it('grid: pinned shortcuts plus every page, without fetching live figures', () => {
        render(<MorePanel {...base} style="grid" onStyleChange={vi.fn()} />);
        expect(screen.getAllByText('AI Chat')).toHaveLength(2);         // pinned + in Tools
        expect(screen.getByText('Personal Loans')).toBeInTheDocument();
        expect(screen.getByText('Budgets').closest('button')).toHaveAttribute('aria-current', 'page');
        expect(screen.queryByText(/over limit/)).toBeNull();
        expect(budgetsAPI.getAll).not.toHaveBeenCalled();
    });

    it('list: rows with descriptions and live figures', async () => {
        render(<MorePanel {...base} style="list" onStyleChange={vi.fn()} />);
        expect(screen.getByText('Limits by category')).toBeInTheDocument();
        expect(await screen.findByText('1 over limit')).toBeInTheDocument();
        expect(await screen.findByText('2 active · 1 near')).toBeInTheDocument();
        expect(await screen.findByText('3 linked')).toBeInTheDocument();
    });

    it('list: shows figures other pages already cached, without fetching them', () => {
        const queryClient = createTestQueryClient();
        queryClient.setQueryData(['net-worth', 'u1'], { current: { net_worth: 1240000 } });
        render(<MorePanel {...base} style="list" onStyleChange={vi.fn()} />, { queryClient });
        expect(screen.getByText('₹12.4L')).toBeInTheDocument();
    });

    it('the header switch flips between the two layouts', () => {
        const onStyleChange = vi.fn();
        const { rerender } = render(<MorePanel {...base} style="grid" onStyleChange={onStyleChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Show as a list' }));
        expect(onStyleChange).toHaveBeenCalledWith('list');
        rerender(<MorePanel {...base} style="list" onStyleChange={onStyleChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Show as a grid' }));
        expect(onStyleChange).toHaveBeenLastCalledWith('grid');
    });
});
