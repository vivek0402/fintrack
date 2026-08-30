import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryField, CategoryPickerDialog, findCategory, type CategoryOption } from './CategoryPickerDialog';

// Desktop path: the mobile branch swaps Modal for a BottomSheet.
vi.mock('@/hooks/useWindowSize', () => ({ useIsMobile: () => false, useWindowSize: () => ({ width: 1200, height: 800 }) }));

vi.mock('@/lib/api', () => ({
    categoriesAPI: { create: vi.fn() },
}));

import { categoriesAPI } from '@/lib/api';

const CATS: CategoryOption[] = [
    { id: 'c1', name: 'Food & Dining', color: '#d97706', icon: 'utensils', usage_count: 128, last_used: '2026-08-28' },
    { id: 'c2', name: 'Transport', color: '#2563eb', icon: 'car', usage_count: 64, last_used: '2026-08-29' },
    { id: 'c3', name: 'Groceries', color: '#16a34a', icon: '🛒', usage_count: 0, last_used: null },
    { id: 'c4', name: 'Education', color: '#0891b2', icon: 'book-open', usage_count: 0, last_used: null },
];

const searchBox = () => screen.getByRole('textbox', { name: 'Search categories' });
const options = () => screen.getAllByRole('option');
const optionNames = () => options().map(o => o.textContent);

beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
});

describe('findCategory', () => {
    it('resolves exact, then substring, then word overlap', () => {
        expect(findCategory(CATS, 'transport')?.id).toBe('c2');
        expect(findCategory(CATS, 'Food')?.id).toBe('c1');       // substring
        expect(findCategory(CATS, 'dining out')?.id).toBe('c1'); // word overlap
        expect(findCategory(CATS, 'zzzz')).toBeNull();
    });
});

describe('CategoryField', () => {
    it('shows the selected category, and a placeholder when there is none', () => {
        const { rerender } = render(
            <CategoryField value="" onChange={vi.fn()} categories={CATS} placeholder="Choose" />
        );
        expect(screen.getByRole('button')).toHaveTextContent('Choose');

        rerender(<CategoryField value="c2" onChange={vi.fn()} categories={CATS} placeholder="Choose" />);
        expect(screen.getByRole('button')).toHaveTextContent('Transport');
    });

    it('opens the dialog on click and reports it via aria-expanded', () => {
        render(<CategoryField value="" onChange={vi.fn()} categories={CATS} />);
        const trigger = screen.getByRole('button');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('resolves the trigger label by name when valueKey is "name"', () => {
        render(<CategoryField valueKey="name" value="Groceries" onChange={vi.fn()} categories={CATS} />);
        expect(screen.getByRole('button')).toHaveTextContent('Groceries');
    });
});

describe('CategoryPickerDialog', () => {
    const open = (props: Partial<React.ComponentProps<typeof CategoryPickerDialog>> = {}) => {
        const onChange = vi.fn();
        const onClose = vi.fn();
        render(
            <CategoryPickerDialog
                isOpen onClose={onClose} value="" onChange={onChange} categories={CATS} {...props}
            />
        );
        return { onChange, onClose };
    };

    it('groups unsearched categories into Frequent and All categories', () => {
        open();
        expect(screen.getByText('Frequent')).toBeInTheDocument();
        expect(screen.getByText('All categories')).toBeInTheDocument();
        // usage desc, then unused alphabetically by the shared sort
        expect(optionNames()[0]).toContain('Food & Dining');
        expect(optionNames()[1]).toContain('Transport');
    });

    it('filters on search and drops the group headings', () => {
        open();
        fireEvent.change(searchBox(), { target: { value: 'gro' } });
        expect(optionNames()).toHaveLength(1);
        expect(optionNames()[0]).toContain('Groceries');
        expect(screen.queryByText('Frequent')).not.toBeInTheDocument();
    });

    it('selects with a click and reports the id plus the whole category', () => {
        const { onChange, onClose } = open();
        fireEvent.click(screen.getByRole('option', { name: /Transport/ }));
        expect(onChange).toHaveBeenCalledWith('c2', expect.objectContaining({ id: 'c2' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('reports the name instead of the id when valueKey is "name"', () => {
        const { onChange } = open({ valueKey: 'name' });
        fireEvent.click(screen.getByRole('option', { name: /Transport/ }));
        expect(onChange).toHaveBeenCalledWith('Transport', expect.objectContaining({ id: 'c2' }));
    });

    it('marks the current value as the selected option', () => {
        open({ value: 'c2' });
        expect(screen.getByRole('option', { name: /Transport/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: /Food/ })).toHaveAttribute('aria-selected', 'false');
    });

    it('moves through the list with arrow keys and picks with Enter', () => {
        const { onChange } = open();
        const box = searchBox();
        fireEvent.keyDown(box, { key: 'ArrowDown' });   // cursor 0 -> 1
        fireEvent.keyDown(box, { key: 'ArrowDown' });   // 1 -> 2
        fireEvent.keyDown(box, { key: 'ArrowUp' });     // 2 -> 1
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('c2', expect.objectContaining({ name: 'Transport' }));
    });

    it('honours exclude', () => {
        open({ exclude: c => c.id === 'c1' });
        expect(optionNames().some(n => n?.includes('Food & Dining'))).toBe(false);
        expect(optionNames().some(n => n?.includes('Transport'))).toBe(true);
    });

    it('offers a None row when allowNone is set and clears the value', () => {
        const { onChange } = open({ allowNone: true, noneLabel: 'No category', value: 'c1' });
        const none = screen.getByRole('option', { name: /No category/ });
        expect(none).toBeInTheDocument();
        fireEvent.click(none);
        expect(onChange).toHaveBeenCalledWith('', null);
    });

    it('says so when nothing matches', () => {
        open();
        fireEvent.change(searchBox(), { target: { value: 'petrol' } });
        expect(screen.queryAllByRole('option')).toHaveLength(0);
        expect(screen.getByText(/No category matches/)).toBeInTheDocument();
    });

    it('offers an inline Create row only when allowCreate is on and nothing matches exactly', () => {
        open({ allowCreate: true });
        // no query -> no create row
        expect(optionNames().some(n => n?.startsWith('Create'))).toBe(false);

        fireEvent.change(searchBox(), { target: { value: 'Petrol' } });
        expect(screen.getByRole('option', { name: /Create/ })).toHaveTextContent('Petrol');

        // an exact match should suppress it
        fireEvent.change(searchBox(), { target: { value: 'Transport' } });
        expect(optionNames().some(n => n?.startsWith('Create'))).toBe(false);
    });

    it('does not offer creation at all without allowCreate', () => {
        open();
        fireEvent.change(searchBox(), { target: { value: 'Petrol' } });
        expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /New category/ })).not.toBeInTheDocument();
    });

    it('creates from the inline row, carrying the typed text, and selects the result', async () => {
        vi.mocked(categoriesAPI.create).mockResolvedValue({
            data: { category: { id: 'new1', name: 'Petrol', color: '#2563eb', icon: '📦' } },
        } as never);

        const { onChange, onClose } = open({ allowCreate: true });
        fireEvent.change(searchBox(), { target: { value: 'Petrol' } });
        fireEvent.click(screen.getByRole('option', { name: /Create/ }));

        // The create bar opens pre-filled with the query.
        const nameInput = screen.getByRole('textbox', { name: 'New category name' }) as HTMLInputElement;
        expect(nameInput.value).toBe('Petrol');

        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() => expect(categoriesAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Petrol' })
        ));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('new1', expect.objectContaining({ id: 'new1' })));
        expect(onClose).toHaveBeenCalled();
    });

    it('keeps the dialog open when Escape dismisses the create bar', () => {
        const { onClose } = open({ allowCreate: true });
        fireEvent.click(screen.getByRole('button', { name: /New category/ }));

        const nameInput = screen.getByRole('textbox', { name: 'New category name' });
        fireEvent.keyDown(nameInput, { key: 'Escape' });

        expect(screen.queryByRole('textbox', { name: 'New category name' })).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('starts clean on each open rather than remembering the last search', () => {
        const { rerender } = render(
            <CategoryPickerDialog isOpen onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />
        );
        fireEvent.change(searchBox(), { target: { value: 'gro' } });
        expect(screen.queryAllByRole('option')).toHaveLength(1);

        rerender(<CategoryPickerDialog isOpen={false} onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />);
        rerender(<CategoryPickerDialog isOpen onClose={vi.fn()} value="" onChange={vi.fn()} categories={CATS} />);

        expect((searchBox() as HTMLInputElement).value).toBe('');
        expect(screen.queryAllByRole('option')).toHaveLength(CATS.length);
    });

    it('paints solid, not glass -- it stacks on top of another sheet', () => {
        open();
        expect(screen.getByRole('dialog')).toHaveClass('glass-solid');
    });

    it('focuses search on desktop so you can type straight away', () => {
        open();
        expect(document.activeElement).toBe(searchBox());
    });

    it('shows a loading note rather than an empty list before categories arrive', () => {
        open({ categories: [] });
        expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
});
