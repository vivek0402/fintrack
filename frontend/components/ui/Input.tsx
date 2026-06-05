'use client';

import { useState } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export function Input({ label, error, icon, style, onFocus, onBlur, ...props }: InputProps) {
    const [focused, setFocused] = useState(false);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            {label && (
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                    {label}
                </label>
            )}
            <div style={{ position: 'relative' }}>
                {icon && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', transition: 'color var(--transition-fast)' }}>
                        {icon}
                    </div>
                )}
                <input
                    onFocus={e => { setFocused(true);  onFocus?.(e); }}
                    onBlur={e  => { setFocused(false); onBlur?.(e);  }}
                    style={{
                        width: '100%',
                        padding: icon ? '10px 16px 10px 38px' : '10px 16px',
                        background: 'var(--bg-alt)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${error ? 'var(--color-exp)' : focused ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '10px',
                        fontSize: '0.875rem',
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
            </div>
            {error && <p style={{ fontSize: '0.75rem', color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}
        </div>
    );
}
