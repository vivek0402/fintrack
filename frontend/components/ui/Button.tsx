'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    children: React.ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    children,
    disabled,
    style,
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    onMouseUp,
    ...props
}: ButtonProps) {
    const [hovered, setHovered] = React.useState(false);
    const [pressed, setPressed] = React.useState(false);

    const base: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontFamily: "'Satoshi', 'DM Sans', sans-serif",
        fontWeight: 600,
        fontSize: '14px',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.4 : 1,
        transition: `all var(--transition-fast)`,
        whiteSpace: 'nowrap' as const,
        outline: 'none',
        flexShrink: 0,
    };

    const sizes: Record<string, React.CSSProperties> = {
        sm: { padding: '6px 12px', fontSize: '12px' },
        md: { padding: '10px 20px', fontSize: '14px' },
        lg: { padding: '12px 24px', fontSize: '15px' },
    };

    const variants: Record<string, React.CSSProperties> = {
        primary: {
            background: hovered && !disabled ? 'var(--accent-blue)' : 'var(--accent-blue)',
            color: '#fff',
            border: 'none',
            opacity: hovered && !disabled ? 0.85 : disabled || isLoading ? 0.4 : 1,
        },
        secondary: {
            background: hovered && !disabled ? 'var(--surface-3)' : 'var(--surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--bg-border)',
        },
        ghost: {
            background: hovered && !disabled ? 'var(--surface-1)' : 'transparent',
            color: 'var(--accent-blue)',
            border: 'none',
            padding: '8px 12px',
        },
        danger: {
            background: 'rgba(244,63,94,0.12)',
            color: 'var(--accent-red)',
            border: '1px solid rgba(244,63,94,0.2)',
        },
        icon: {
            width: '36px',
            height: '36px',
            padding: '0',
            background: hovered && !disabled ? 'var(--surface-3)' : 'var(--surface-2)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-sm)',
        },
    };

    const transform = pressed && !disabled && !isLoading ? 'scale(0.97)' : 'scale(1)';

    const variantStyle = variants[variant] || variants.primary;
    // For primary, override the opacity from base since we handle it in variant
    const finalOpacity = variant === 'primary'
        ? (disabled || isLoading ? 0.4 : hovered && !disabled ? 0.85 : 1)
        : (disabled || isLoading ? 0.4 : 1);

    return (
        <button
            disabled={disabled || isLoading}
            style={{
                ...base,
                ...(variant !== 'icon' ? sizes[size] : {}),
                ...variantStyle,
                transform,
                opacity: finalOpacity,
                ...style,
            }}
            onMouseEnter={e => { setHovered(true); onMouseEnter?.(e); }}
            onMouseLeave={e => { setHovered(false); setPressed(false); onMouseLeave?.(e); }}
            onMouseDown={e => { setPressed(true); onMouseDown?.(e); }}
            onMouseUp={e => { setPressed(false); onMouseUp?.(e); }}
            {...props}
        >
            {isLoading ? (
                <>
                    <div style={{
                        width: '14px', height: '14px',
                        border: '2px solid currentColor',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                    }} />
                    Loading...
                </>
            ) : children}
        </button>
    );
}
