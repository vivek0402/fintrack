'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useIsClient, useIsNative } from '@/components/lock/useIsNative';
import { closeQuickAdd, openMainApp } from '@/lib/widgetAdd';
import { inQuickAddActivity } from '@/lib/appLock';
import { useAuthStore } from '@/store/authStore';

// The page is drawn over the Android home screen (QuickAddActivity: a
// translucent window that already dims the launcher), so it paints no
// background, no ambient backdrop and no scrim of its own. The app lock never
// covers it there (lib/appLock.ts isLockExemptRoute).
//
// Glass needs something real behind it (DESIGN.md), and a native home screen
// isn't something the WebView can sample: a translucent sheet just shows the
// widgets and icons through the fields. So on this route every sheet and
// dialog fill (--glass-sheet-surface: the form, its nested pickers, the fund
// search dropdown) is the solid surface; radius, border and edge highlight
// are untouched. Scoped to this page's <style>, so in-app sheets keep glass.
const TRANSPARENT_CSS = `
html, body { background: transparent !important; }
.ambient-lighting { display: none; }
html:root, html[data-theme] { --glass-sheet-surface: var(--bg-surface-1); }
.glass-sheet { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
`;

/**
 * /widget-add/: the Android widgets' "+". Only the Add Transaction form, as a
 * bottom sheet over the home screen. Saving, closing, tapping the dimmed area
 * or Back finish the activity. Not a page for browsers: on the web or the PWA
 * it forwards to the in-app form.
 */
export default function WidgetAddPage() {
    const router = useRouter();
    const isClient = useIsClient();
    const native = useIsNative();
    const token = useAuthStore(s => s.token);
    const saved = useRef(false);
    const closing = useRef(false);

    // Only QuickAddActivity shows the sheet. Anywhere else (browser, PWA, or
    // the full app's own WebView, where this route is NOT lock-exempt) it
    // forwards to the in-app form, under the normal lock.
    const inSheet = isClient && native && inQuickAddActivity();
    useEffect(() => {
        if (isClient && !inSheet) router.replace('/transactions?add=true');
    }, [isClient, inSheet, router]);

    // TransactionModal calls onSuccess then onClose once the POST resolves
    // (and only onClose after an offline save or a cancel).
    const onSuccess = useCallback(() => { saved.current = true; }, []);
    const close = useCallback(() => {
        if (closing.current) return;
        closing.current = true;
        closeQuickAdd({ refreshWidgets: saved.current });
    }, []);

    let sheet: React.ReactNode = null;
    if (inSheet) {
        sheet = token
            ? <TransactionModal isOpen onClose={close} onSuccess={onSuccess} scrim={false} holdUntilReady />
            : <LoggedOutSheet onClose={close} />;
    }

    return (
        <>
            <style>{TRANSPARENT_CSS}</style>
            {sheet}
        </>
    );
}

function LoggedOutSheet({ onClose }: { onClose: () => void }) {
    return (
        <BottomSheet isOpen onClose={onClose} scrim={false}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-5)', padding: 'var(--space-2) 0 var(--space-2)' }}>
                <p style={{ margin: 0, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', lineHeight: 1.3, color: 'var(--text-primary)' }}>
                    Log in to FinTrack to add transactions
                </p>
                <Button size="lg" onClick={() => { openMainApp(); }} style={{ width: '100%' }}>
                    Open FinTrack
                </Button>
            </div>
        </BottomSheet>
    );
}
