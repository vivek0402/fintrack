'use client';

import React from 'react';

interface State { hasError: boolean; error?: Error }

export class PageErrorBoundary extends React.Component<{ children: React.ReactNode; pageName?: string }, State> {
    constructor(props: { children: React.ReactNode; pageName?: string }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[PageErrorBoundary] ${this.props.pageName ?? 'Page'} crashed:`, error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '16px', padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '40px', lineHeight: 1 }}>😕</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Something went wrong{this.props.pageName ? ` on ${this.props.pageName}` : ''}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, maxWidth: '320px', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                    {this.state.error?.message || 'An unexpected error occurred.'}
                </p>
                <button type="button" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
                    style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Reload page
                </button>
            </div>
        );
    }
}
