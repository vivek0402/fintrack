import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBarStrip, STATUS_BAR_STRIP_Z } from './StatusBarStrip';

function strip(): HTMLElement {
    const { container } = render(<StatusBarStrip />);
    return container.querySelector('[data-status-bar-strip]') as HTMLElement;
}

describe('StatusBarStrip', () => {
    it('is a fixed, full-width band exactly as tall as the top inset', () => {
        const el = strip();
        expect(el).not.toBeNull();
        expect(el.style.position).toBe('fixed');
        expect(el.style.top).toBe('0px');
        expect(el.style.left).toBe('0px');
        expect(el.style.right).toBe('0px');
        expect(el.style.height).toBe('var(--sa-top)');
        expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('is solid and theme-aware (a token, not a colour), so no glow shows through', () => {
        const el = strip();
        expect(el.style.background).toBe('var(--bg-base)');
        // Hairline as a shadow: a zero-height strip (web) draws nothing at all.
        expect(el.style.borderBottom).toBe('');
        expect(el.style.boxShadow).toContain('var(--border-subtle)');
    });

    it('sits above page chrome but below every scrim', () => {
        const el = strip();
        expect(Number(el.style.zIndex)).toBe(STATUS_BAR_STRIP_Z);
        expect(STATUS_BAR_STRIP_Z).toBeGreaterThan(990); // BulkOpsPanel, sticky headers, FABs
        expect(STATUS_BAR_STRIP_Z).toBeLessThan(998);    // More-panel scrim; modals/sheets are 9999+
    });
});
