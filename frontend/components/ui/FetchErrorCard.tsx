'use client';

// Shared inline error card for a failed data fetch with no cache to fall
// back to. Used by both the transactions list and the analytics calendar --
// extracted so the two views (calendar moved out of /transactions into
// /analytics on 2026-08-25) don't carry two copies of the same 15 lines.
export function FetchErrorCard({ onRetry }: { onRetry: () => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Couldn't load transactions
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Check your connection and try again.
            </p>
            <button type="button" onClick={onRetry}
                style={{ marginTop: '4px', padding: '8px 16px', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Retry
            </button>
        </div>
    );
}
