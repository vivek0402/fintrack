import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePresence } from './usePresence';

afterEach(() => vi.useRealTimers());

describe('usePresence', () => {
    it('stays rendered through the exit, then unmounts', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(({ open }) => usePresence(open, 240), { initialProps: { open: true } });
        expect(result.current).toMatchObject({ rendered: true, closing: false });

        rerender({ open: false });
        expect(result.current).toMatchObject({ rendered: true, closing: true });

        act(() => { vi.advanceTimersByTime(240); });
        expect(result.current).toMatchObject({ rendered: false, closing: false });
    });

    it('re-opening mid-exit cancels the exit and starts a new generation', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(({ open }) => usePresence(open, 240), { initialProps: { open: true } });
        const first = result.current.generation;
        rerender({ open: false });
        act(() => { vi.advanceTimersByTime(100); });
        rerender({ open: true });
        act(() => { vi.advanceTimersByTime(300); });
        expect(result.current).toMatchObject({ rendered: true, closing: false });
        expect(result.current.generation).toBe(first + 1);
    });

    it('never renders while closed from the start', () => {
        const { result } = renderHook(() => usePresence(false, 240));
        expect(result.current).toMatchObject({ rendered: false, closing: false });
    });
});
