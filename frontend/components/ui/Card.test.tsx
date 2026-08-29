import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './Card';
import { GCard } from './GCard';
import { StatTile } from './StatTile';

// These three were flipped to glass-by-default on 2026-08-26, which let 12
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

describe('GCard', () => {
    it('is glass by default', () => {
        render(<GCard>g</GCard>);
        expect(screen.getByText('g')).toHaveClass('glass-surface');
    });

    it('accepts a lighter nested-in-glass override via style', () => {
        // Budgets' split modal relies on this: GCards nested inside an
        // already-glass Modal take .glass-field instead of glass-on-glass.
        render(<GCard style={{ background: 'var(--glass-fill-1)' }}>g</GCard>);
        expect(screen.getByText('g')).toHaveStyle({ background: 'var(--glass-fill-1)' });
    });
});

describe('StatTile', () => {
    it('renders label and value, and is glass in both states', () => {
        const { container, rerender } = render(<StatTile label="Total Budget" value="₹45,000" />);
        expect(screen.getByText('Total Budget')).toBeInTheDocument();
        expect(screen.getByText('₹45,000')).toBeInTheDocument();
        expect(container.firstChild).toHaveClass('glass-surface');

        // The loading branch is a separate return path -- it regressed on
        // Investments once by keeping an opaque fill after the main one moved.
        rerender(<StatTile label="" value="" loading />);
        expect(container.firstChild).toHaveClass('glass-surface');
    });

    it('applies accentColor to the value', () => {
        render(<StatTile label="Spent" value="₹28,100" accentColor="var(--color-exp)" />);
        expect(screen.getByText('₹28,100')).toHaveStyle({ color: 'var(--color-exp)' });
    });
});
