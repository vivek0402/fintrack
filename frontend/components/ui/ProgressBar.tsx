'use client';

interface ProgressBarProps {
    pct: number;           // 0–150 (> 100 triggers over-budget red)
    color?: string;        // custom fill colour; defaults to var(--accent-2)
    height?: number;       // px, defaults to 5
}

export function ProgressBar({ pct, color, height = 5 }: ProgressBarProps) {
    const overBudget = pct > 100;
    const fillColor = overBudget ? 'var(--color-exp)' : (color ?? 'var(--accent-2)');
    const fillWidth = `${Math.min(Math.max(pct, 0), 100)}%`;

    return (
        <div style={{
            height: `${height}px`,
            background: 'var(--border-subtle)',
            borderRadius: '999px',
            overflow: 'hidden',
        }}>
            <div style={{
                height: '100%',
                width: fillWidth,
                background: fillColor,
                borderRadius: '999px',
                transition: 'width 0.8s cubic-bezier(.4,0,.2,1), background 0.3s ease',
            }} />
        </div>
    );
}
