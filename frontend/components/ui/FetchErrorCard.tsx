'use client';

import { type } from '@/lib/typography';
import { Button } from './Button';

// Shared inline error card for a failed data fetch with no cache to fall
// back to. Used by both the transactions list and the analytics calendar --
// extracted so the two views (calendar moved out of /transactions into
// /analytics on 2026-08-25) don't carry two copies of the same 15 lines.
export function FetchErrorCard({ onRetry, message = "Couldn't load transactions" }: { onRetry: () => void; message?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-8) var(--space-5)', textAlign: 'center' }}>
            <p style={{ ...type.bodyStrong, margin: 0 }}>{message}</p>
            <p style={{ ...type.meta, margin: 0 }}>Check your connection and try again.</p>
            <div style={{ marginTop: 'var(--space-2)' }}>
                <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
            </div>
        </div>
    );
}
