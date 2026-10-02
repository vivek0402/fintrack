import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SwipeableRow } from './SwipeableRow';

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

function setup() {
    const onSwipeLeft = vi.fn();
    render(<SwipeableRow onSwipeLeft={onSwipeLeft}><div>row</div></SwipeableRow>);
    const layer = screen.getByText('row').parentElement as HTMLElement;
    return { onSwipeLeft, layer };
}

describe('SwipeableRow', () => {
    it('ignores a mostly-vertical drag (a scroll), even with sideways drift', () => {
        const { onSwipeLeft, layer } = setup();
        fireEvent.touchStart(layer, touch(200, 100));
        fireEvent.touchMove(layer, touch(185, 140));  // 15px left, 40px down
        fireEvent.touchMove(layer, touch(100, 300));  // later drift must not count
        expect(layer.style.transform).toBe('translateX(0px)');
        expect(screen.queryByText('Delete')).toBeNull();
        fireEvent.touchEnd(layer);
        expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('a horizontal swipe past the threshold deletes', () => {
        vi.useFakeTimers();
        const { onSwipeLeft, layer } = setup();
        fireEvent.touchStart(layer, touch(200, 100));
        fireEvent.touchMove(layer, touch(150, 104));
        fireEvent.touchMove(layer, touch(100, 106));
        expect(layer.style.transform).toBe('translateX(-100px)');
        fireEvent.touchEnd(layer);
        act(() => { vi.advanceTimersByTime(300); });
        expect(onSwipeLeft).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
