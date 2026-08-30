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
    it('does not autofocus search, so the keyboard stays down', () => {
        render(<CategoryPickerDialog isOpen onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />);
        const search = screen.getByRole('textbox', { name: 'Search categories' });
        expect(search).toBeInTheDocument();
        expect(document.activeElement).not.toBe(search);
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
