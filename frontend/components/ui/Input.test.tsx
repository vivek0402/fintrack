import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
    it('links the label to the field', () => {
        render(<Input label="Amount" type="number" />);
        expect(screen.getByLabelText('Amount')).toHaveAttribute('type', 'number');
    });

    it('uses the id the caller gives it', () => {
        render(<Input label="Who" id="my-id" />);
        expect(screen.getByLabelText('Who')).toHaveAttribute('id', 'my-id');
    });

    it('gives two inputs different ids', () => {
        render(<><Input label="One" /><Input label="Two" /></>);
        expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id);
    });

    it('describes the field by its hint, and by its error when there is one', () => {
        const { rerender } = render(<Input label="Rate" hint="Per month" />);
        expect(screen.getByLabelText('Rate')).toHaveAccessibleDescription('Per month');
        rerender(<Input label="Rate" hint="Per month" error="Required" />);
        const field = screen.getByLabelText('Rate');
        expect(field).toHaveAccessibleDescription('Required');
        expect(field).toHaveAttribute('aria-invalid', 'true');
    });
});
