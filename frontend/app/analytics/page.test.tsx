import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnalyticsPage from './page';

// Only the tab shell is under test: which tab ?tab= selects, and that every
// tab is a visible chip. The heavy tab bodies are stubbed out.

let search = 'tab=health';
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/store/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1' }, isLoading: false, loadFromStorage: vi.fn() }),
}));
vi.mock('@/components/analytics/health/HealthTab', () => ({ HealthTab: () => <div>health-tab-body</div> }));
vi.mock('@/components/analytics/CalendarTab', () => ({ CalendarTab: () => <div>calendar-tab-body</div> }));
vi.mock('@/lib/api', () => ({}));

describe('Insights page tabs', () => {
    it('?tab=health selects the Health tab', async () => {
        search = 'tab=health';
        render(<AnalyticsPage />);
        expect(await screen.findByText('health-tab-body')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Health' })).toHaveStyle({ background: 'var(--accent)' });
    });

    it('shows every tab as a chip, in order', async () => {
        search = 'tab=calendar';
        render(<AnalyticsPage />);
        const labels = ['Overview', 'Health', 'Insights', 'Reports', 'Year Review', 'Calendar', 'Personality'];
        const chips = screen.getAllByRole('button').filter(b => labels.includes(b.textContent ?? ''));
        expect(chips.map(b => b.textContent)).toEqual(labels);
        expect(await screen.findByText('calendar-tab-body')).toBeInTheDocument();
    });
});
