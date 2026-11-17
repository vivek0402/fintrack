'use client';

import { useId, useState } from 'react';
import { type } from '@/lib/typography';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
    label?: string;
    error?: string;
    hint?: string;
    icon?: React.ReactNode;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
}

export function Input({ label, error, hint, icon, prefix, suffix, style, onFocus, onBlur, id, 'aria-describedby': describedByProp, ...props }: InputProps) {
    const [focused, setFocused] = useState(false);
    // The label is linked to the field (and hint/error to it) so screen readers,
    // getByLabelText and click-the-label-to-focus all work. A caller's own id wins.
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const messageId = `${inputId}-message`;
    const describedBy = [describedByProp, error || hint ? messageId : undefined].filter(Boolean).join(' ') || undefined;

    const leading = icon ?? prefix;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
            {label && (
                <label htmlFor={inputId} style={type.label}>
                    {label}
                </label>
            )}
            <div style={{ position: 'relative' }}>
                {leading && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent-text)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', transition: 'color var(--transition-fast)', pointerEvents: 'none' }}>
                        {leading}
                    </div>
                )}
                <input
                    id={inputId}
                    aria-describedby={describedBy}
                    aria-invalid={error ? true : undefined}
                    onFocus={e => { setFocused(true);  onFocus?.(e); }}
                    onBlur={e  => { setFocused(false); onBlur?.(e);  }}
                    style={{
                        width: '100%',
                        height: '40px',
                        padding: `0 ${suffix ? '38px' : '14px'} 0 ${leading ? '38px' : '14px'}`,
                        background: 'var(--glass-fill-1)',
                        border: `1px solid ${error ? 'var(--color-exp)' : 'var(--glass-border)'}`,
                        borderRadius: 'var(--radius-md)',
                        ...type.body,
                        color: 'var(--text-primary)',
                        outline: focused ? '2px solid var(--accent-text)' : 'none',
                        outlineOffset: focused ? 1 : undefined,
                        boxSizing: 'border-box',
                        transition: 'border-color var(--transition-fast)',
                        ...style,
                    }}
                    {...props}
                />
                {suffix && (
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        {suffix}
                    </div>
                )}
            </div>
            {error && <p id={messageId} style={{ ...type.meta, color: 'var(--color-exp-text)', margin: 0 }}>{error}</p>}
            {!error && hint && <p id={messageId} style={{ ...type.meta, color: 'var(--text-muted)', margin: 0 }}>{hint}</p>}
        </div>
    );
}
