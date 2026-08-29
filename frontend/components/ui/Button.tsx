'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    children: React.ReactNode;
}

const HEIGHTS: Record<string, number> = { sm: 32, md: 40, lg: 48 };
const PADDINGS: Record<string, string> = { sm: '0 12px', md: '0 20px', lg: '0 24px' };
const FONT_SIZES: Record<string, string> = { sm: '13px', md: '14px', lg: '15px' };
const SPINNER_SIZES: Record<string, number> = { sm: 14, md: 16, lg: 16 };

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
        gap: '8px',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: FONT_SIZES[size],
        height: HEIGHTS[size],
        borderRadius: 'var(--radius-md)',
        border: 'none',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        transition: 'transform 180ms cubic-bezier(0.34,1.56,0.64,1), opacity 150ms ease, background 150ms ease',
        whiteSpace: 'nowrap' as const,
        outline: 'none',
        flexShrink: 0,
    };

    const variants: Record<string, React.CSSProperties> = {
        primary: {
            padding: PADDINGS[size],
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
        },
        secondary: {
            padding: PADDINGS[size],
            background: hovered && !disabled ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
            color: 'var(--text-primary)',
            border: '1px solid var(--glass-border)',
        },
        ghost: {
            padding: PADDINGS[size],
            background: hovered && !disabled ? 'var(--accent-subtle)' : 'transparent',
            color: 'var(--accent)',
            border: 'none',
        },
        danger: {
            padding: PADDINGS[size],
            background: 'var(--color-exp-subtle)',
            color: 'var(--color-exp)',
            border: '1px solid color-mix(in srgb, var(--color-exp) 22%, transparent)',
        },
        icon: {
            width: HEIGHTS[size],
            padding: '0',
            background: hovered && !disabled ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)',
        },
    };

    const transform = pressed && !disabled && !isLoading ? 'scale(0.93)' : 'scale(1)';
    const variantStyle = variants[variant] || variants.primary;
    const finalOpacity = disabled || isLoading ? 0.4 : hovered && !disabled && (variant === 'primary') ? 0.88 : 1;

    return (
        <button
            disabled={disabled || isLoading}
            style={{ ...base, ...variantStyle, transform, opacity: finalOpacity, ...style }}
            onMouseEnter={e => { setHovered(true);  onMouseEnter?.(e); }}
            onMouseLeave={e => { setHovered(false); setPressed(false); onMouseLeave?.(e); }}
            onMouseDown={e  => { setPressed(true);  onMouseDown?.(e); }}
            onMouseUp={e    => { setPressed(false); onMouseUp?.(e); }}
            {...props}
        >
            {isLoading ? (
                <div style={{
                    width: SPINNER_SIZES[size],
                    height: SPINNER_SIZES[size],
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                }} />
            ) : children}
        </button>
    );
}
