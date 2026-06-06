'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

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
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px',
            background: showReconnect ? 'var(--accent)' : 'var(--color-warn, #f59e0b)',
            color: showReconnect ? 'white' : '#78350f',
            fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)',
            transition: 'background 0.3s ease',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        }}>
            {showReconnect
                ? <><Wifi size={14} /> Back online — syncing…</>
                : <><WifiOff size={14} /> You're offline — changes will sync when reconnected</>
            }
        </div>
    );
}
