'use client';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export function Input({ label, error, icon, style, ...props }: InputProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            {label && (
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {label}
                </label>
            )}
            <div style={{ position: 'relative' }}>
                {icon && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        {icon}
                    </div>
                )}
                <input
                    style={{
                        width: '100%',
                        padding: icon ? '10px 16px 10px 38px' : '10px 16px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${error ? 'rgba(244,63,94,0.5)' : 'var(--bg-border)'}`,
                        borderRadius: '12px',
                        fontSize: '0.875rem',
                        fontFamily: 'DM Sans, sans-serif',
                        outline: 'none',
                        boxSizing: 'border-box',
                        ...style,
                    }}
                    {...props}
                />
            </div>
            {error && <p style={{ fontSize: '0.75rem', color: '#f43f5e', margin: 0 }}>{error}</p>}
        </div>
    );
}