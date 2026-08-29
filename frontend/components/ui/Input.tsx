'use client';

import { useState } from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
    label?: string;
    error?: string;
    hint?: string;
    icon?: React.ReactNode;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
}

export function Input({ label, error, hint, icon, prefix, suffix, style, onFocus, onBlur, ...props }: InputProps) {
    const [focused, setFocused] = useState(false);

    const leading = icon ?? prefix;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
            {label && (
                <label style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-label)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                }}>
                    {label}
                </label>
            )}
            <div style={{ position: 'relative' }}>
                {leading && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', transition: 'color var(--transition-fast)', pointerEvents: 'none' }}>
                        {leading}
                    </div>
                )}
                <input
                    onFocus={e => { setFocused(true);  onFocus?.(e); }}
                    onBlur={e  => { setFocused(false); onBlur?.(e);  }}
                    style={{
                        width: '100%',
                        height: '40px',
                        padding: `0 ${suffix ? '38px' : '14px'} 0 ${leading ? '38px' : '14px'}`,
                        background: 'var(--glass-fill-1)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${error ? 'var(--color-exp)' : focused ? 'var(--accent)' : 'var(--glass-border)'}`,
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-body)',
                        fontFamily: 'var(--font-body)',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
                        boxShadow: error
                            ? 'color-mix(in srgb, var(--color-exp) 15%, transparent) 0 0 0 3px'
                            : focused
                            ? 'color-mix(in srgb, var(--accent) 15%, transparent) 0 0 0 3px'
                            : 'none',
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
            {error && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}
            {!error && hint && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{hint}</p>}
        </div>
    );
}
