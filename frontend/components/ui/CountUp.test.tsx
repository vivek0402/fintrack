import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { CountUp } from './CountUp';

function mockMatchMedia(matches: boolean) {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
        matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
}

// Drive requestAnimationFrame by hand so the tween is deterministic.
function mockRaf() {
    let queue: FrameRequestCallback[] = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.push(cb); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { queue = []; });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    return {
        advance(ms: number) {
            now += ms;
            const run = queue; queue = [];
            act(() => run.forEach(cb => cb(now)));
        },
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('CountUp', () => {
    it('jumps straight to the value when prefers-reduced-motion is set', () => {
        mockMatchMedia(true);
        const { container } = render(<CountUp value={500} />);
        expect(container.textContent).toBe('500');
    });

    it('tweens from 0 to the value, ending exactly on it', () => {
        mockMatchMedia(false);
        const raf = mockRaf();
        const { container } = render(<CountUp value={500} duration={900} format={n => `₹${n}`} />);
        expect(container.textContent).toBe('₹0');
        raf.advance(450);
        const mid = Number(container.textContent!.slice(1));
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(500);
        raf.advance(450);
        expect(container.textContent).toBe('₹500');
    });

    it('does not throw when matchMedia is unavailable, and still tweens', () => {
        vi.stubGlobal('matchMedia', undefined);
        mockRaf();
        const { container } = render(<CountUp value={500} />);
        expect(container.textContent).toBe('0');
    });

    it('never re-renders its parent while animating', () => {
        mockMatchMedia(false);
        const raf = mockRaf();
        let parentRenders = 0;
        function Parent() {
            useEffect(() => { parentRenders++; });
            return <CountUp value={1000} duration={900} />;
        }
        render(<Parent />);
        const settled = parentRenders;
        for (let i = 0; i < 10; i++) raf.advance(100);
        expect(parentRenders).toBe(settled);
    });

    it('holds its place while disabled', () => {
        mockMatchMedia(true);
        const { container, rerender } = render(<CountUp value={0} enabled={false} />);
        expect(container.textContent).toBe('0');
        rerender(<CountUp value={250} enabled />);
        expect(container.textContent).toBe('250');
    });
});
