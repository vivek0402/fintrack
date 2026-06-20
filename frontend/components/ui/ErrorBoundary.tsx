'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, message: '' };
    }

    static getDerivedStateFromError(err: Error): State {
        return { hasError: true, message: err.message };
    }

    componentDidCatch(err: Error) {
        console.error('[ErrorBoundary]', err.message);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: 'var(--space-12)',
                    gap: 'var(--space-4)', textAlign: 'center',
                }}>
                    <AlertTriangle size={32} color="var(--color-warn)" />
                    <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        Something went wrong
                    </p>
                    <p style={{ fontFamily: "'Satoshi', sans-serif", fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        {this.state.message || 'An unexpected error occurred. Try refreshing the page.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, message: '' })}
                        style={{ padding: '8px 20px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'Satoshi', sans-serif" }}
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
