import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PlanningPage from './page';
import { planningAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

// Covers only deleting an existing plan.

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Stable references: the page refetches on every `user` identity change.
vi.mock('@/store/authStore', () => {
    const state = { user: { id: 'u1', currency: 'INR' }, isLoading: false, loadFromStorage: () => {} };
    return { useAuthStore: () => state };
});

vi.mock('@/store/toastStore', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/useCategories', () => ({ useCategories: () => ({ categories: [] }) }));

vi.mock('@/lib/api', () => ({
    planningAPI: {
        getPlan: vi.fn(),
        deletePlan: vi.fn(),
        getNarrative: vi.fn(),
        recalculate: vi.fn(),
        applyRecalculation: vi.fn(),
        savePlan: vi.fn(),
    },
}));

const EXISTING_PLAN = {
    exists: true,
    plan: { monthly_income: 100000, risk_profile: 'balanced', goal_amount: null, loan_principal: null },
    expenses: [],
    projection: [],
    fiveYearSummary: [],
    recommendedFunds: [],
    staticNarrative: null,
};

const getPlan = vi.mocked(planningAPI.getPlan);
const deletePlan = vi.mocked(planningAPI.deletePlan);

async function openAndConfirmDelete() {
    render(<PlanningPage />);
    fireEvent.click(await screen.findByRole('button', { name: /delete plan/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
}

describe('PlanningPage delete plan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        getPlan.mockResolvedValue({ data: EXISTING_PLAN } as never);
        vi.mocked(planningAPI.getNarrative).mockReturnValue(new Promise(() => {}) as never);
    });

    it('deletes the plan after confirming and returns to the setup wizard', async () => {
        deletePlan.mockResolvedValue({ data: {} } as never);
        localStorage.setItem('fintrack-planning-has-credit-card-u1', 'true');

        await openAndConfirmDelete();

        await waitFor(() => expect(screen.getByText('Build Your Financial Plan')).toBeInTheDocument());
        expect(deletePlan).toHaveBeenCalledTimes(1);
        expect(toast.success).toHaveBeenCalledWith('Financial plan deleted');
        expect(localStorage.getItem('fintrack-planning-has-credit-card-u1')).toBeNull();
    });

    it('keeps the plan and shows an error when the delete fails', async () => {
        deletePlan.mockRejectedValue({ response: { status: 500 } });

        await openAndConfirmDelete();

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete your financial plan'));
        expect(screen.getByText('Your Financial Plan')).toBeInTheDocument();
    });

    it('treats a 404 as already deleted', async () => {
        deletePlan.mockRejectedValue({ response: { status: 404 } });

        await openAndConfirmDelete();

        await waitFor(() => expect(screen.getByText('Build Your Financial Plan')).toBeInTheDocument());
    });
});
