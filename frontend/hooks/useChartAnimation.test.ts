import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChartAnimation, resetChartAnimations } from './useChartAnimation';

beforeEach(() => resetChartAnimations());
afterEach(() => vi.unstubAllGlobals());

describe('useChartAnimation', () => {
    it('animates a chart the first time it appears, then draws it instantly', () => {
        const first = renderHook(() => useChartAnimation('trend', 700));
        expect(first.result.current).toEqual({ isAnimationActive: true, animationDuration: 700 });
        first.unmount();

        const again = renderHook(() => useChartAnimation('trend', 700));
        expect(again.result.current).toEqual({ isAnimationActive: false, animationDuration: 0 });

        // Other charts are tracked separately.
        const other = renderHook(() => useChartAnimation('pie'));
        expect(other.result.current.isAnimationActive).toBe(true);
    });

    it('never animates under prefers-reduced-motion', () => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
        const { result } = renderHook(() => useChartAnimation('trend'));
        expect(result.current).toEqual({ isAnimationActive: false, animationDuration: 0 });
    });
});
