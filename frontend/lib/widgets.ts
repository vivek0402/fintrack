import { Capacitor } from '@capacitor/core';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';

// Android home-screen widgets (native side: WidgetRefresh / WidgetRenderer).
// The widgets refresh themselves in the background with their own long-lived,
// widget-scoped token; this module only hands that token over, nudges a
// refresh when the numbers change, and signs the widgets out on logout.
//
// Deliberately does not import lib/api.ts: store/authStore.ts imports this
// module, and api.ts imports authStore.

function isNative(): boolean {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

const REFRESH_DEBOUNCE_MS = 1500;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Ask the widgets to refetch. Debounced so a bulk edit/delete (many requests
 * in a row) costs one refresh, not one per row.
 */
export function refreshWidgets(): void {
    if (!isNative()) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        refreshTimer = null;
        try {
            FinTrackNative.refreshWidgets().catch(() => {});
        } catch {
            /* older APK without widgets */
        }
    }, REFRESH_DEBOUNCE_MS);
}

/**
 * On app start and resume (native + logged in): if a FinTrack widget is on
 * the home screen, make sure it has a token, issuing one via `issueToken`
 * (POST /api/widget/token) only if none is stored, then refresh. With no
 * widget placed, nothing is minted. Never throws.
 */
export async function ensureWidgetToken(issueToken: () => Promise<string | null | undefined>): Promise<void> {
    if (!isNative()) return;
    try {
        const widgets = await FinTrackNative.hasWidgets();
        if (!widgets.present) return;
        const { present } = await FinTrackNative.hasWidgetToken();
        if (present) {
            await FinTrackNative.refreshWidgets();
            return;
        }
        const token = await issueToken();
        // saveWidgetToken also triggers the first refresh natively.
        if (token) await FinTrackNative.saveWidgetToken({ token });
    } catch {
        /* best effort — the next app start tries again */
    }
}

/**
 * Logout: revoke the widget token server-side (best effort; the access token
 * may already be expired, e.g. on a failed silent refresh), then clear it
 * natively so the widgets show "Open FinTrack to set up" instead of numbers.
 * Only on native: logging out on the web must not kill a phone's widgets.
 */
export function signOutWidgets(accessToken: string | null): void {
    if (!isNative()) return;
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (accessToken && apiUrl) {
        // keepalive: logout often navigates away (window.location) right after.
        try {
            fetch(`${apiUrl}/api/widget/revoke`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                keepalive: true,
            }).catch(() => {});
        } catch {
            /* ignore */
        }
    }
    // try/catch as well as .catch: logout must never throw, even against an
    // older APK whose plugin predates this method.
    try {
        FinTrackNative.clearWidgetToken().catch(() => {});
    } catch {
        /* ignore */
    }
}

// Every API route that creates, edits or deletes transactions (backend
// routes with INSERT INTO / UPDATE / DELETE FROM transactions), since those
// change the numbers the widgets show. Broad prefixes are fine: a spurious
// refresh is one debounced background fetch.
const TX_WRITE_PATHS: RegExp[] = [
    /^\/api\/transactions(?:[/?]|$)/,                                   // add/edit/delete
    /^\/api\/import\/bank-statement\/[^/?]+\/confirm(?:[?]|$)/,          // statement import
    /^\/api\/recurring\/process(?:[?]|$)/,                               // post due recurring
    /^\/api\/splits(?:[/?]|$)/,                                         // splits
    /^\/api\/groups(?:[/?]|$)/,                                         // group splits, (un)link
    /^\/api\/credit-cards\/[^/?]+\/(?:pay|convert-to-emi)(?:[?]|$)/,     // card payment, EMI
    /^\/api\/one-time-expenses(?:[/?]|$)/,                              // one-time expense items
    /^\/api\/personal-loans(?:[/?]|$)/,                                 // loan disbursal/repayment
    /^\/api\/accounts(?:[/?]|$)/,                                       // account (re)assignment
];
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * True for a create/edit/delete on any route that writes transactions.
 * Accepts a path ('/api/...') or an absolute URL (plain fetch() callers).
 */
export function isTransactionWrite(method: string | undefined, url: string | undefined): boolean {
    if (!method || !url || !WRITE_METHODS.has(method.toLowerCase())) return false;
    const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
    return TX_WRITE_PATHS.some(re => re.test(path));
}
