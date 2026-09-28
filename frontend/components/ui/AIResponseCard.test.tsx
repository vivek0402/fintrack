import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AIResponseCard } from './AIResponseCard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// The card renders model output. It used to build an HTML string and inject
// it; an unterminated tag borrowed the `>` from the highlight span and ran.

describe('AIResponseCard', () => {
    it('never turns model output into markup, including unterminated tags', () => {
        const payload = 'Heads up. <img src=x onerror="window.__xss=1" a=₹5 more text';
        const { container } = render(<AIResponseCard message={payload} type="insight" />);
        expect(container.querySelector('img')).toBeNull();
        expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
        expect(container.textContent).toContain('onerror');
    });

    it('drops complete tags from the displayed text', () => {
        const { container } = render(<AIResponseCard message="You spent <b>a lot</b> today." type="insight" />);
        expect(container.querySelector('b')).toBeNull();
        expect(container.textContent).toContain('You spent a lot today.');
    });

    it('still highlights rupee amounts and percentages', () => {
        const { container } = render(
            <AIResponseCard message="You saved ₹12,500 this month, which is 18% of income." type="insight" />
        );
        const highlighted = [...container.querySelectorAll('span')].map(s => s.textContent);
        expect(highlighted).toEqual(expect.arrayContaining(['₹12,500', '18%']));
    });
});
