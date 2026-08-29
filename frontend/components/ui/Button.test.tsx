import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { Input } from './Input';
import { Tabs } from './Tabs';

describe('Button', () => {
    it('fires onClick when enabled', () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Save</Button>);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not fire onClick when disabled or loading', () => {
        const onClick = vi.fn();
        const { rerender } = render(<Button onClick={onClick} disabled>Save</Button>);
        fireEvent.click(screen.getByRole('button'));
        rerender(<Button onClick={onClick} isLoading>Save</Button>);
        fireEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('uses the glass fill scale for secondary, not an opaque surface token', () => {
        // Converted 2026-08-26 so the shared component matches the hand-rolled
        // Cancel buttons the rollout produced across ~27 call sites.
        render(<Button variant="secondary">Cancel</Button>);
        expect(screen.getByRole('button')).toHaveStyle({ background: 'var(--glass-fill-1)' });
    });

    it('lifts one fill level on hover, and not while disabled', () => {
        const { rerender } = render(<Button variant="secondary">Cancel</Button>);
        const btn = screen.getByRole('button');
        fireEvent.mouseEnter(btn);
        expect(btn).toHaveStyle({ background: 'var(--glass-fill-2)' });

        rerender(<Button variant="secondary" disabled>Cancel</Button>);
        const off = screen.getByRole('button');
        fireEvent.mouseEnter(off);
        expect(off).toHaveStyle({ background: 'var(--glass-fill-1)' });
    });

    it('keeps ghost transparent and danger on its semantic tint', () => {
        const { rerender } = render(<Button variant="ghost">Skip</Button>);
        expect(screen.getByRole('button')).toHaveStyle({ background: 'transparent' });
        rerender(<Button variant="danger">Delete</Button>);
        expect(screen.getByRole('button')).toHaveStyle({ background: 'var(--color-exp-subtle)' });
    });
});

describe('Input', () => {
    it('renders label and forwards value changes', () => {
        const onChange = vi.fn();
        render(<Input label="Account name" value="" onChange={onChange} />);
        expect(screen.getByText('Account name')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'HDFC' } });
        expect(onChange).toHaveBeenCalled();
    });

    it('shows an error message and colours the border with it', () => {
        render(<Input label="Email" error="Required" />);
        expect(screen.getByText('Required')).toBeInTheDocument();
        // toHaveStyle can't parse a `border` shorthand containing var(), though
        // jsdom does keep it in the style attribute -- assert that instead.
        expect(screen.getByRole('textbox').getAttribute('style'))
            .toContain('border: 1px solid var(--color-exp)');
    });

    it('rests on the glass fill and takes the accent border on focus', () => {
        // The `variant="glass"` prop was removed on 2026-08-26 once every page
        // was glass -- this is now the only behaviour, not an opt-in.
        render(<Input label="Amount" />);
        const el = screen.getByRole('textbox');
        expect(el).toHaveStyle({ background: 'var(--glass-fill-1)' });
        fireEvent.focus(el);
        expect(el.getAttribute('style')).toContain('border: 1px solid var(--accent)');
    });
});

describe('Tabs', () => {
    const tabs = [
        { key: 'budgets', label: 'Budgets' },
        { key: 'recurring', label: 'Recurring' },
    ];

    it('reports the tab that was clicked', () => {
        const onChange = vi.fn();
        render(<Tabs tabs={tabs} active="budgets" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Recurring' }));
        expect(onChange).toHaveBeenCalledWith('recurring');
    });

    it('paints the active pill accent and leaves inactive ones to the glass class', () => {
        render(<Tabs tabs={tabs} active="budgets" onChange={vi.fn()} />);
        const active = screen.getByRole('button', { name: 'Budgets' });
        const inactive = screen.getByRole('button', { name: 'Recurring' });

        expect(active).toHaveStyle({ background: 'var(--accent)' });
        expect(inactive).toHaveClass('glass-field');
        expect(active).not.toHaveClass('glass-field');
        // An inline background here would shadow .glass-field's fill.
        expect(inactive.style.background).toBe('');
    });

    it('clears the inline hover on leave so the class fill returns', () => {
        render(<Tabs tabs={tabs} active="budgets" onChange={vi.fn()} />);
        const inactive = screen.getByRole('button', { name: 'Recurring' });

        fireEvent.mouseEnter(inactive);
        expect(inactive).toHaveStyle({ background: 'var(--glass-fill-2)' });
        fireEvent.mouseLeave(inactive);
        expect(inactive.style.background).toBe('');
    });
});
