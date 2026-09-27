import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_LOCK_SETTINGS, LOCK_ATTEMPTS_KEY, hashPin } from '@/lib/appLock';
import { useLockStore } from '@/store/lockStore';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { LockScreen } from './LockScreen';
import { PinSetup } from './PinSetup';
import { SecuritySection } from './SecuritySection';

const native = vi.hoisted(() => ({ value: false }));

vi.mock('@capacitor/core', async (orig) => {
    const actual = await orig<typeof import('@capacitor/core')>();
    return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => native.value } };
});

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/store/toastStore', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        saveToken: vi.fn(async () => {}),
        clearToken: vi.fn(async () => {}),
        biometricStatus: vi.fn(async () => ({ status: 'available' })),
        authenticate: vi.fn(async () => ({ result: 'cancel' })),
        setSecureFlag: vi.fn(async () => {}),
        setPinHash: vi.fn(async () => {}),
        getPinHash: vi.fn(async () => ({ hash: null })),
        clearLock: vi.fn(async () => {}),
    },
}));

const plugin = vi.mocked(FinTrackNative);

function typePin(pin: string) {
    for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
}
const filledDots = () => screen.getAllByTestId('pin-dot').filter(d => d.dataset.filled === 'true').length;

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    native.value = false;
    useLockStore.setState({ settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true, biometric: true }, locked: false });
});

describe('LockScreen', () => {
    it('shows the fingerprint lock and opens the system prompt by itself', async () => {
        render(<LockScreen onSuccess={vi.fn()} onForgot={vi.fn()} />);
        expect(screen.getByText('FinTrack is locked')).toBeInTheDocument();
        expect(screen.getByText('Touch the sensor to see your money')).toBeInTheDocument();
        await waitFor(() => expect(plugin.authenticate).toHaveBeenCalledTimes(1));
    });

    it('unlocks on a fingerprint match', async () => {
        plugin.authenticate.mockResolvedValueOnce({ result: 'success' });
        const onSuccess = vi.fn();
        render(<LockScreen onSuccess={onSuccess} onForgot={vi.fn()} />);
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    });

    it('"Use PIN instead" switches to the keypad', () => {
        render(<LockScreen onSuccess={vi.fn()} onForgot={vi.fn()} />);
        fireEvent.click(screen.getByText('Use PIN instead'));
        expect(screen.getByText('Enter your PIN')).toBeInTheDocument();
        expect(screen.getByText('Forgot PIN? Log in again')).toBeInTheDocument();
    });

    it('goes straight to the keypad when fingerprint is off', () => {
        useLockStore.setState({ settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true, biometric: false } });
        render(<LockScreen onSuccess={vi.fn()} onForgot={vi.fn()} />);
        expect(screen.getByText('Enter your PIN')).toBeInTheDocument();
        expect(plugin.authenticate).not.toHaveBeenCalled();
    });

    it('fills dots as digits are typed, unlocks on the right PIN', async () => {
        useLockStore.setState({ settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true } });
        plugin.getPinHash.mockResolvedValue({ hash: await hashPin('2580', { iterations: 1000 }) });
        const onSuccess = vi.fn();
        render(<LockScreen onSuccess={onSuccess} onForgot={vi.fn()} />);
        typePin('25');
        expect(filledDots()).toBe(2);
        fireEvent.click(screen.getByRole('button', { name: 'Delete last digit' }));
        expect(filledDots()).toBe(1);
        typePin('580');
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    });

    it('rejects a wrong PIN and persists the failure', async () => {
        useLockStore.setState({ settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true } });
        plugin.getPinHash.mockResolvedValue({ hash: await hashPin('2580', { iterations: 1000 }) });
        const onSuccess = vi.fn();
        render(<LockScreen onSuccess={onSuccess} onForgot={vi.fn()} />);
        typePin('1111');
        expect(await screen.findByText('Wrong PIN. 4 tries left')).toBeInTheDocument();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem(LOCK_ATTEMPTS_KEY)!).failures).toBe(1);
    });

    it('shows a countdown while cooling down after 5 wrong PINs', async () => {
        useLockStore.setState({ settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true } });
        localStorage.setItem(LOCK_ATTEMPTS_KEY, JSON.stringify({ failures: 5, cooldownUntil: Date.now() + 20_000 }));
        render(<LockScreen onSuccess={vi.fn()} onForgot={vi.fn()} />);
        expect(screen.getByText(/Too many tries/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    });
});

describe('PinSetup', () => {
    it('asks to confirm, and flags a mismatch', async () => {
        const onDone = vi.fn();
        render(<PinSetup onDone={onDone} onCancel={vi.fn()} />);
        expect(screen.getByText('Choose a PIN')).toBeInTheDocument();
        typePin('1234');
        expect(screen.getByText('Confirm your PIN')).toBeInTheDocument();
        typePin('4321');
        expect(await screen.findByText('PINs didn’t match. Try again.')).toBeInTheDocument();
        expect(screen.getByText('Choose a PIN')).toBeInTheDocument();
        expect(onDone).not.toHaveBeenCalled();
    });
});

describe('SecuritySection', () => {
    it('is hidden on web', () => {
        const { container } = render(<SecuritySection />);
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByText('App lock')).not.toBeInTheDocument();
    });

    it('shows the lock controls in the Android app', async () => {
        native.value = true;
        render(<SecuritySection />);
        expect(screen.getByText('Security')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'App lock' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: '1 min' })).toHaveAttribute('aria-checked', 'true');
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Use fingerprint' })).not.toBeDisabled());
    });

    it('says so when the phone has no fingerprint', async () => {
        native.value = true;
        plugin.biometricStatus.mockResolvedValueOnce({ status: 'not_enrolled' });
        render(<SecuritySection />);
        expect(await screen.findByText('No fingerprint set up on this phone')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Use fingerprint' })).toBeDisabled();
    });
});
