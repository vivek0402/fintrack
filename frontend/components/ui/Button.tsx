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
    ...props
}: ButtonProps) {
    const base: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: 500,
        borderRadius: '12px',
        border: 'none',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.6 : 1,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
    };

    const sizes: Record<string, React.CSSProperties> = {
        sm: { padding: '6px 12px', fontSize: '0.8rem' },
        md: { padding: '9px 18px', fontSize: '0.875rem' },
        lg: { padding: '12px 24px', fontSize: '1rem' },
    };

    const variants: Record<string, React.CSSProperties> = {
        primary: { background: '#10b981', color: '#fff' },
        secondary: { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' },
        danger: { background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)' },
    };

    return (
        <button
            disabled={disabled || isLoading}
            style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
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