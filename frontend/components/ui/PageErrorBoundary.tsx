'use client';

import React from 'react';
import { type } from '@/lib/typography';
import { Button } from './Button';

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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 'var(--space-4)', padding: 'var(--space-8)', textAlign: 'center' }}>
                <p style={{ ...type.title, margin: 0 }}>
                    Something went wrong{this.props.pageName ? ` on ${this.props.pageName}` : ''}
                </p>
                <p style={{ ...type.body, margin: 0, maxWidth: 320 }}>
                    {this.state.error?.message || 'An unexpected error occurred.'}
                </p>
                <Button variant="primary" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>
                    Reload page
                </Button>
            </div>
        );
    }
}
