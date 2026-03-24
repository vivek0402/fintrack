'use client';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger';
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
    ...props
}: ButtonProps) {
    const base: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: 600,
        borderRadius: '10px',
        border: 'none',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.6 : 1,
        transition: 'all var(--transition-fast)',
        whiteSpace: 'nowrap',
    };

    const sizes: Record<string, React.CSSProperties> = {
        sm: { padding: '6px 14px', fontSize: '0.78rem' },
        md: { padding: '9px 18px', fontSize: '0.875rem' },
        lg: { padding: '11px 22px', fontSize: '0.9rem' },
    };

    const variants: Record<string, React.CSSProperties> = {
        primary: {
            background: 'linear-gradient(135deg, var(--accent-blue) 0%, #1d4ed8 100%)',
            color: '#fff',
            boxShadow: '0 2px 10px var(--accent-blue-border)',
        },
        secondary: {
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--bg-border)',
        },
        danger: {
            background: 'linear-gradient(135deg, var(--accent-red) 0%, #be123c 100%)',
            color: '#fff',
            boxShadow: '0 2px 10px var(--accent-red-border)',
        },
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!disabled && !isLoading) {
            const el = e.currentTarget as HTMLElement;
            if (variant === 'primary') {
                el.style.boxShadow = 'var(--shadow-glow-blue)';
                el.style.transform = 'translateY(-1px)';
            } else if (variant === 'secondary') {
                el.style.background = 'var(--bg-hover)';
                el.style.borderColor = 'var(--accent-blue-border)';
                el.style.transform = 'translateY(-1px)';
            } else if (variant === 'danger') {
                el.style.boxShadow = 'var(--shadow-glow-red)';
                el.style.transform = 'translateY(-1px)';
            }
        }
        onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = variant === 'primary' ? '0 2px 10px var(--accent-blue-border)' : variant === 'danger' ? '0 2px 10px var(--accent-red-border)' : '';
        el.style.transform = '';
        el.style.background = variant === 'secondary' ? 'var(--bg-card)' : '';
        el.style.borderColor = '';
        onMouseLeave?.(e);
    };

    return (
        <button
            disabled={disabled || isLoading}
            style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            {...props}
        >
            {isLoading ? (
                <>
                    <div style={{ width: '14px', height: '14px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Loading...
                </>
            ) : children}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </button>
    );
}
