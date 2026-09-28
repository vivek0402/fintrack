import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { useAuthStore } from '@/store/authStore';
import { useLockStore } from '@/store/lockStore';
import { AppLockGate, __resetPageLoadForTests } from '@/components/lock/AppLockGate';
import { LOCKED_ATTR, LOCK_BG_AT_KEY, LOCK_SETTINGS_KEY, readSettings } from '@/lib/appLock';
import { LOCK_HEAD_SCRIPT } from '@/lib/lockHeadScript';
import WidgetAddPage from './page';

const native = vi.hoisted(() => ({ value: true }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock('@capacitor/core', async (orig) => {
    const actual = await orig<typeof import('@capacitor/core')>();
    return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => native.value } };
});

vi.mock('next/navigation', () => ({
    useRouter: () => router,
    usePathname: () => '/widget-add',
}));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        closeQuickAdd: vi.fn(async () => {}),
        openMainApp: vi.fn(async () => {}),
        saveToken: vi.fn(async () => {}),
        clearToken: vi.fn(async () => {}),
        clearLock: vi.fn(async () => {}),
        clearWidgetToken: vi.fn(async () => {}),
        setSecureFlag: vi.fn(async () => {}),
        authenticate: vi.fn(async () => ({ result: 'cancel' })),
        biometricStatus: vi.fn(async () => ({ status: 'available' })),
        getPinHash: vi.fn(async () => ({ hash: null })),
        elapsedRealtime: vi.fn(async () => ({ ms: 0 })),
    },
}));

vi.mock('@capacitor/app', () => ({
    App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

// The form itself is covered by TransactionModal.test.tsx. Here: what the
// page passes it, and what happens on its onSuccess/onClose, which the real
// modal calls only after the POST resolves (onClose alone on cancel).
const modalProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('@/components/transactions/TransactionModal', () => ({
    TransactionModal: (props: { onSuccess: () => void; onClose: () => void }) => {
        modalProps.current = props as unknown as Record<string, unknown>;
        return (
            <div data-testid="tx-modal">
                <button onClick={() => { props.onSuccess(); props.onClose(); }}>save</button>
                <button onClick={() => props.onClose()}>cancel</button>
            </div>
        );
    },
}));

const plugin = vi.mocked(FinTrackNative);

beforeEach(() => {
    vi.clearAllMocks();
    native.value = true;
    modalProps.current = null;
    useAuthStore.setState({ token: 't', refreshToken: 'r', isLoading: false });
    useLockStore.setState({ locked: false });
});

describe('/widget-add (Android widget add sheet)', () => {
    it('renders only the Add Transaction form, without a scrim, holding until its data loads', () => {
        render(<WidgetAddPage />);
        expect(screen.getByTestId('tx-modal')).toBeInTheDocument();
        expect(modalProps.current).toMatchObject({ isOpen: true, scrim: false, holdUntilReady: true });
        expect(modalProps.current?.transaction).toBeUndefined();
    });

    it('closes the sheet and refreshes the widgets after a save', async () => {
        render(<WidgetAddPage />);
        await act(async () => { fireEvent.click(screen.getByText('save')); });
        expect(plugin.closeQuickAdd).toHaveBeenCalledTimes(1);
        expect(plugin.closeQuickAdd).toHaveBeenCalledWith({ refreshWidgets: true });
    });

    it('closes the sheet without a refresh on cancel', async () => {
        render(<WidgetAddPage />);
        await act(async () => { fireEvent.click(screen.getByText('cancel')); });
        expect(plugin.closeQuickAdd).toHaveBeenCalledWith({ refreshWidgets: false });
    });

    it('closes only once even if close fires twice', async () => {
        render(<WidgetAddPage />);
        await act(async () => {
            fireEvent.click(screen.getByText('cancel'));
            fireEvent.click(screen.getByText('cancel'));
        });
        expect(plugin.closeQuickAdd).toHaveBeenCalledTimes(1);
    });

    it('with app lock on, opens straight to the form: no lock screen', () => {
        window.history.replaceState({}, '', '/widget-add/');
        try {
            localStorage.setItem(LOCK_SETTINGS_KEY, JSON.stringify({ enabled: true, biometric: true, graceMs: 0, hideRecents: false }));
            localStorage.setItem(LOCK_BG_AT_KEY, '1700000000000');
            new Function(LOCK_HEAD_SCRIPT)();
            expect(document.documentElement.hasAttribute(LOCKED_ATTR)).toBe(false);
            useLockStore.setState({ settings: readSettings(localStorage), locked: false });
            __resetPageLoadForTests();
            render(<><AppLockGate /><WidgetAddPage /></>);
            expect(useLockStore.getState().locked).toBe(false);
            expect(screen.getByTestId('tx-modal')).toBeInTheDocument();
            expect(document.querySelector('[data-lock-root]')).toBeNull();
            expect(plugin.authenticate).not.toHaveBeenCalled();
        } finally {
            localStorage.clear();
            window.history.replaceState({}, '', '/');
        }
    });

    it('logged out: a compact sheet that opens the app', async () => {
        useAuthStore.setState({ token: null, refreshToken: null });
        render(<WidgetAddPage />);
        expect(screen.queryByTestId('tx-modal')).toBeNull();
        expect(screen.getByText('Log in to FinTrack to add transactions')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('Open FinTrack')); });
        expect(plugin.openMainApp).toHaveBeenCalledTimes(1);
    });

    it('logged out: tapping the dimmed area closes the sheet', async () => {
        vi.useFakeTimers();
        try {
            useAuthStore.setState({ token: null, refreshToken: null });
            render(<WidgetAddPage />);
            const scrim = screen.getByTestId('sheet-scrim');
            expect(scrim.style.background).toBe('transparent');
            fireEvent.click(scrim);
            await act(async () => { vi.advanceTimersByTime(300); });
            expect(plugin.closeQuickAdd).toHaveBeenCalledWith({ refreshWidgets: false });
        } finally {
            vi.useRealTimers();
        }
    });

    it('on the web / PWA, forwards to the in-app form', () => {
        native.value = false;
        render(<WidgetAddPage />);
        expect(router.replace).toHaveBeenCalledWith('/transactions?add=true');
        expect(screen.queryByTestId('tx-modal')).toBeNull();
    });

    it('makes every sheet fill opaque on this route only (nothing behind it to frost)', () => {
        const { container } = render(<WidgetAddPage />);
        const css = container.querySelector('style')?.textContent ?? '';
        expect(css).toMatch(/--glass-sheet-surface:\s*var\(--bg-surface-1\)/);
        expect(css).toMatch(/\.glass-sheet\s*\{[^}]*backdrop-filter:\s*none/);
    });
});
