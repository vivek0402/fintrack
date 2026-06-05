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
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>
                    {label}
                </label>
            )}
            <div style={{ position: 'relative' }}>
                {icon && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent-blue)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', transition: 'color var(--transition-fast)' }}>
                        {icon}
                    </div>
                )}
                <input
                    onFocus={e => { setFocused(true); onFocus?.(e); }}
                    onBlur={e => { setFocused(false); onBlur?.(e); }}
                    style={{
                        width: '100%',
                        padding: icon ? '10px 16px 10px 38px' : '10px 16px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${error ? 'var(--accent-red)' : focused ? 'var(--accent-blue)' : 'var(--bg-border)'}`,
                        borderRadius: '10px',
                        fontSize: '0.875rem',
                        fontFamily: "'Satoshi', 'DM Sans', sans-serif",
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
                        boxShadow: error ? 'var(--shadow-glow-red)' : focused ? '0 0 0 3px var(--accent-blue-bg)' : 'none',
                        ...style,
                    }}
                    {...props}
                />
            </div>
            {error && <p style={{ fontSize: '0.75rem', color: 'var(--accent-red)', margin: 0 }}>{error}</p>}
        </div>
    );
}
