'use client';

import { useState, useEffect } from 'react';
import { type } from '@/lib/typography';

export function OfflineBanner() {
    const [isOnline, setIsOnline] = useState(true);
    const [showReconnect, setShowReconnect] = useState(false);

    useEffect(() => {
        setIsOnline(navigator.onLine);

        const handleOffline = () => {
            setIsOnline(false);
            setShowReconnect(false);
        };
        const handleOnline = () => {
            setIsOnline(true);
            setShowReconnect(true);
            setTimeout(() => setShowReconnect(false), 3000);
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    if (isOnline && !showReconnect) return null;

    return (
        <div style={{
            position: 'fixed', top: 'var(--sa-top)', left: 0, right: 0, zIndex: 9999,
            height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'var(--space-2)',
            background: 'var(--bg-surface-2)',
            borderBottom: '1px solid var(--border-subtle)',
        }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: showReconnect ? 'var(--color-inc)' : 'var(--color-warn)' }} />
            <span style={{ ...type.meta, color: 'var(--text-primary)' }}>
                {showReconnect
                    ? 'Back online. Syncing.'
                    : 'You are offline. Changes will sync when you reconnect.'}
            </span>
        </div>
    );
}
