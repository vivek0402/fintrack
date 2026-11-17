'use client';

import React from 'react';
import { type } from '@/lib/typography';
import { Button } from './Button';

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
                    <p style={{ ...type.title, margin: 0 }}>Something went wrong</p>
                    <p style={{ ...type.body, margin: 0, maxWidth: 320 }}>
                        {this.state.message || 'An unexpected error occurred. Try refreshing the page.'}
                    </p>
                    <Button variant="secondary" onClick={() => this.setState({ hasError: false, message: '' })}>
                        Try again
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}
