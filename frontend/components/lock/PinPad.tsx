'use client';

import { Delete, FingerprintPattern } from 'lucide-react';
import { type } from '@/lib/typography';

const KEY_SIZE = 64;

const digitKeyStyle: React.CSSProperties = {
    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    ...type.num, fontSize: 'var(--text-figure)',
};

const keyStyle = (disabled: boolean): React.CSSProperties => ({
    width: KEY_SIZE, height: KEY_SIZE, borderRadius: 'var(--radius-full)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-primary)', cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1, padding: 0,
    transition: 'background-color var(--transition-fast), opacity var(--transition-fast)', WebkitTapHighlightColor: 'transparent',
});

/**
 * Four PIN dots over a 3×4 keypad: 1–9, then [fingerprint, 0, backspace].
 * Stateless — the owner keeps the digits and decides what a full PIN means.
 */
export function PinPad({ title, message, error, length, value, onDigit, onBackspace, onFingerprint, disabled = false }: {
    title: string;
    message?: React.ReactNode;
    error?: boolean;
    length: number;
    value: string;
    onDigit: (d: string) => void;
    onBackspace: () => void;
    onFingerprint?: () => void;
    disabled?: boolean;
}) {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-6)', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                <h1 style={{ ...type.heading, margin: 0, textAlign: 'center' }}>{title}</h1>
                <p role={error ? 'alert' : undefined} aria-live="polite" style={{ ...type.body, color: error ? 'var(--color-exp-text)' : 'var(--text-secondary)', margin: 0, textAlign: 'center', minHeight: 21 }}>
                    {message}
                </p>
            </div>

            <div aria-label={`${value.length} of ${length} digits entered`} role="status" style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
                {Array.from({ length }, (_, i) => {
                    const filled = i < value.length;
                    return (
                        <span
                            key={i}
                            data-testid="pin-dot"
                            data-filled={filled ? 'true' : 'false'}
                            style={{
                                width: 14, height: 14, borderRadius: 'var(--radius-full)', boxSizing: 'border-box',
                                background: filled ? (error ? 'var(--color-exp)' : 'var(--text-primary)') : 'transparent',
                                border: `1.5px solid ${error ? 'var(--color-exp)' : filled ? 'var(--text-primary)' : 'var(--border-visible)'}`,
                                transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
                            }}
                        />
                    );
                })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${KEY_SIZE}px)`, columnGap: 'var(--space-7)', rowGap: 'var(--space-4)' }}>
                {digits.map(d => (
                    <button key={d} type="button" className="fin-pin-key" aria-label={d} disabled={disabled} onClick={() => onDigit(d)}
                        style={{ ...keyStyle(disabled), ...digitKeyStyle }}>
                        {d}
                    </button>
                ))}
                {onFingerprint ? (
                    <button type="button" className="fin-pin-key" aria-label="Use fingerprint" onClick={onFingerprint}
                        style={{ ...keyStyle(false), background: 'none', border: 'none', color: 'var(--text-secondary)' }}>
                        <FingerprintPattern size={26} />
                    </button>
                ) : <span aria-hidden="true" />}
                <button type="button" className="fin-pin-key" aria-label="0" disabled={disabled} onClick={() => onDigit('0')}
                    style={{ ...keyStyle(disabled), ...digitKeyStyle }}>
                    0
                </button>
                <button type="button" className="fin-pin-key" aria-label="Delete last digit" disabled={disabled || value.length === 0} onClick={onBackspace}
                    style={{ ...keyStyle(disabled || value.length === 0), background: 'none', border: 'none', color: 'var(--text-secondary)' }}>
                    <Delete size={24} />
                </button>
            </div>
        </div>
    );
}
