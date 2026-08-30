import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryPickerDialog, type CategoryOption } from './CategoryPickerDialog';

// Mobile path. The picker stays a centred dialog at every size rather than
// swapping to a BottomSheet, and must not summon the on-screen keyboard.
vi.mock('@/hooks/useWindowSize', () => ({ useIsMobile: () => true, useWindowSize: () => ({ width: 390, height: 844 }) }));
vi.mock('@/lib/api', () => ({ categoriesAPI: { create: vi.fn() } }));

const CATS: CategoryOption[] = [
    { id: 'c1', name: 'Food', color: '#d97706', icon: 'utensils', usage_count: 12, last_used: '2026-08-28' },
];

describe('CategoryPickerDialog on mobile', () => {
    it('keeps focus off the search field, so the keyboard stays down', () => {
        // Two separate things used to summon it: autoFocus on the input, and
        // Modal moving focus to the first focusable on open. Both are covered
        // here -- focus must land on the dialog itself.
        render(<CategoryPickerDialog isOpen onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />);
        const search = screen.getByRole('textbox', { name: 'Search categories' });
        expect(search).toBeInTheDocument();
        expect(document.activeElement).not.toBe(search);
        expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });

    it('stacks above a BottomSheet rather than tying with it', () => {
        // Modal and BottomSheet both base at 9999/10000. Opened on top of the
        // transaction form's sheet the picker tied, and DOM order put it
        // underneath -- the form rendered straight over the category list.
        render(<CategoryPickerDialog isOpen onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />);
        const dialog = screen.getByRole('dialog');
        const scrim = dialog.parentElement!;
        expect(Number(scrim.style.zIndex)).toBeGreaterThan(10000);
        expect(Number(dialog.style.zIndex)).toBeGreaterThan(Number(scrim.style.zIndex));
    });

    it('stays a centred popup rather than becoming a bottom sheet', () => {
        render(<CategoryPickerDialog isOpen onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveClass('glass-solid');
        // BottomSheet renders a drag grabber and no role="dialog"; this is the
        // Modal path, which centres itself in a fixed scrim.
        expect(dialog.parentElement).toHaveStyle({ position: 'fixed' });
    });
});
