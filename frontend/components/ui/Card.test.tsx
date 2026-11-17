import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './Card';

// Card was flipped to glass-by-default on 2026-08-26, which let 12
// duplicated `glassTileStyle` override consts be deleted from page files. The
// contract that made that safe is asserted here: the glass look comes from the
// class, and a caller's `style` prop still wins over it.

describe('Card', () => {
    it('carries the glass-surface class so callers need no override', () => {
        render(<Card>body</Card>);
        expect(screen.getByText('body')).toHaveClass('glass-surface');
    });

    it('lets a caller style override win over the default', () => {
        render(<Card style={{ borderRadius: '3px', background: 'rebeccapurple' }}>body</Card>);
        const el = screen.getByText('body');
        expect(el).toHaveStyle({ borderRadius: '3px', background: 'rebeccapurple' });
    });

    it('leaves background unset by default so the class fill applies', () => {
        render(<Card>body</Card>);
        // An inline background would shadow .glass-surface's fill entirely.
        expect(screen.getByText('body').style.background).toBe('');
    });

    it('uses the denser sheet fill when elevated', () => {
        render(<Card elevated>body</Card>);
        expect(screen.getByText('body')).toHaveStyle({ background: 'var(--glass-sheet-surface)' });
    });

    it('fires onClick and lifts on hover only when interactive', () => {
        const onClick = vi.fn();
        const { rerender } = render(<Card onClick={onClick}>tap</Card>);
        const el = screen.getByText('tap');

        fireEvent.mouseEnter(el);
        expect(el).toHaveStyle({ background: 'var(--glass-fill-2)' });
        fireEvent.click(el);
        expect(onClick).toHaveBeenCalledOnce();

        // Without onClick the same hover must not repaint the card.
        rerender(<Card>tap</Card>);
        const plain = screen.getByText('tap');
        fireEvent.mouseEnter(plain);
        expect(plain.style.background).toBe('');
    });
});
