import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, type ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ debtAPI: { getCreditUtilization: vi.fn() } }));

import { CreditUtilizationWidget } from './CreditUtilizationWidget';
import { debtAPI } from '@/lib/api';

// Shows "crashed" instead of unmounting silently, so a throw can't pass as "rendered nothing".
class Boundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
    state = { crashed: false };
    static getDerivedStateFromError() { return { crashed: true }; }
    render() { return this.state.crashed ? 'crashed' : this.props.children; }
}

// A malformed or partial API response must hide the widget, not crash the
// whole dashboard (it used to read data.aggregate.overall_utilization_pct
// unguarded).
describe('CreditUtilizationWidget with incomplete data', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        ['no aggregate', { per_card: [{ card_id: 1 }] }],
        ['no per_card', { aggregate: { overall_utilization_pct: 20 } }],
        ['empty object', {}],
    ])('renders nothing for %s', async (_label, data) => {
        (debtAPI.getCreditUtilization as ReturnType<typeof vi.fn>).mockResolvedValue({ data });
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { container } = render(<Boundary><CreditUtilizationWidget /></Boundary>);
        await waitFor(() => expect(debtAPI.getCreditUtilization).toHaveBeenCalled());
        // Once loading settles: nothing rendered, and no crash.
        await waitFor(() => expect(container.innerHTML).toBe(''));
        expect(container.textContent).not.toContain('crashed');
        spy.mockRestore();
    });
});
