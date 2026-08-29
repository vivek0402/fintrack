import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

// Desktop path: the mobile branch renders a BottomSheet instead.
vi.mock('@/hooks/useWindowSize', () => ({ useIsMobile: () => false }));

beforeEach(() => { document.body.style.overflow = ''; });

describe('Modal', () => {
    it('renders nothing until open', () => {
        const { rerender } = render(
            <Modal isOpen={false} onClose={vi.fn()} title="Add Budget">body</Modal>
        );
        expect(screen.queryByText('body')).not.toBeInTheDocument();

        rerender(<Modal isOpen onClose={vi.fn()} title="Add Budget">body</Modal>);
        expect(screen.getByText('body')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveAccessibleName('Add Budget');
    });

    it('is a glass sheet, not an opaque panel', () => {
        render(<Modal isOpen onClose={vi.fn()} title="T">body</Modal>);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveClass('glass-surface');
        expect(dialog).toHaveClass('glass-sheet');
    });

    it('closes on Escape and on scrim click, but not on a click inside', () => {
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} title="T">body</Modal>);

        fireEvent.click(screen.getByText('body'));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('dialog').parentElement!);
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('locks body scroll while open and restores it on close', () => {
        const { rerender } = render(<Modal isOpen onClose={vi.fn()} title="T">body</Modal>);
        expect(document.body.style.overflow).toBe('hidden');

        rerender(<Modal isOpen={false} onClose={vi.fn()} title="T">body</Modal>);
        expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('ref-counts the scroll lock so a stacked modal cannot unlock early', () => {
        // The add-transaction form opens its own date-picker Modal on top. If
        // the lock were not ref-counted, closing the inner one would restore
        // scrolling while the outer was still open.
        const outer = render(<Modal isOpen onClose={vi.fn()} title="Outer">outer body</Modal>);
        const inner = render(<Modal isOpen onClose={vi.fn()} title="Inner">inner body</Modal>);
        expect(document.body.style.overflow).toBe('hidden');

        inner.unmount();
        expect(document.body.style.overflow).toBe('hidden');

        outer.unmount();
        expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('renders the footer when given one', () => {
        render(
            <Modal isOpen onClose={vi.fn()} title="T" footer={<button>Set Budget</button>}>
                body
            </Modal>
        );
        expect(screen.getByRole('button', { name: 'Set Budget' })).toBeInTheDocument();
    });
});
