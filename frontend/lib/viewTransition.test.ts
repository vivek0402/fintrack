import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const push = vi.fn();
let pathname = '/dashboard';
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    usePathname: () => pathname,
}));

import { useTransitionNavigate, resolveViewTransition } from './viewTransition';

type Doc = { startViewTransition?: unknown };

beforeEach(() => { push.mockClear(); pathname = '/dashboard'; });
afterEach(() => {
    delete (document as unknown as Doc).startViewTransition;
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function stubTransitions() {
    let update: (() => Promise<void>) | null = null;
    (document as unknown as Doc).startViewTransition = vi.fn((cb: () => Promise<void>) => { update = cb; });
    return { run: () => update!() };
}

describe('useTransitionNavigate', () => {
    it('navigates inside a view transition and lets it finish when the route commits', async () => {
        const vt = stubTransitions();
        const { result } = renderHook(() => useTransitionNavigate());
        result.current('/transactions');

        let settled = false;
        const done = vt.run().then(() => { settled = true; });
        expect(push).toHaveBeenCalledWith('/transactions');
        await Promise.resolve();
        expect(settled).toBe(false);   // still holding the old frame

        resolveViewTransition();       // AppLayout: new route committed
        await done;
        expect(settled).toBe(true);
    });

    it('never holds the old frame longer than 400ms', async () => {
        vi.useFakeTimers();
        const vt = stubTransitions();
        const { result } = renderHook(() => useTransitionNavigate());
        result.current('/analytics');
        const done = vt.run();
        vi.advanceTimersByTime(400);
        await expect(done).resolves.toBeUndefined();
    });

    it('plain push without the API, under reduced motion, or for a same-page link', () => {
        const { result, rerender } = renderHook(() => useTransitionNavigate());
        result.current('/goals');                       // no API
        expect(push).toHaveBeenLastCalledWith('/goals');

        stubTransitions();
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
        rerender();
        result.current('/budgets');                     // reduced motion
        expect((document as unknown as Doc).startViewTransition).not.toHaveBeenCalled();
        expect(push).toHaveBeenLastCalledWith('/budgets');

        vi.unstubAllGlobals();
        pathname = '/transactions';
        rerender();
        result.current('/transactions?add=true');       // same page
        expect((document as unknown as Doc).startViewTransition).not.toHaveBeenCalled();
        expect(push).toHaveBeenLastCalledWith('/transactions?add=true');
    });
});
