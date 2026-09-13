import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryFeedback } from './EntryFeedback';

describe('EntryFeedback', () => {
    it('renders nothing for no signals', () => {
        const { container } = render(<EntryFeedback signals={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the first warning and the first info only', () => {
        render(<EntryFeedback signals={[
            { kind: 'duplicate', level: 'warn', text: 'Dup!' },
            { kind: 'anomaly', level: 'warn', text: 'Big!' },
            { kind: 'budget_pace', level: 'info', text: 'Pace' },
            { kind: 'goal_impact', level: 'info', text: 'Goal' },
        ]} />);
        expect(screen.getByText('Dup!')).toBeInTheDocument();
        expect(screen.getByText('Pace')).toBeInTheDocument();
        expect(screen.queryByText('Big!')).toBeNull();
        expect(screen.queryByText('Goal')).toBeNull();
    });

    it('colours warnings with the warn token', () => {
        render(<EntryFeedback signals={[{ kind: 'duplicate', level: 'warn', text: 'Dup!' }]} />);
        expect(screen.getByText('Dup!').parentElement).toHaveStyle({ color: 'var(--color-warn)' });
    });

    it('links to groups for the split hint', () => {
        render(<EntryFeedback signals={[{ kind: 'split_hint', level: 'info', text: 'Shared?', action: 'split' }]} />);
        expect(screen.getByRole('link', { name: /open groups/i })).toHaveAttribute('href', '/groups');
    });

    it('keeps the split-hint link scoped to the info line, not the adjacent warning', () => {
        render(<EntryFeedback signals={[
            { kind: 'duplicate', level: 'warn', text: 'Dup!' },
            { kind: 'split_hint', level: 'info', text: 'Shared?', action: 'split' },
        ]} />);
        const dupLine = screen.getByText('Dup!').parentElement!;
        expect(dupLine.querySelector('a')).toBeNull();
        expect(screen.getByRole('link', { name: /open groups/i })).toBeInTheDocument();
    });
});
