'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FingerprintPattern } from 'lucide-react';
import {
    AttemptState, NO_ATTEMPTS, PIN_LENGTH, attemptsLeft, cooldownRemainingMs, isUsablePinHash, readAttempts,
    registerFailure, verifyPin, writeAttempts,
} from '@/lib/appLock';
import { FinTrackNative, BiometricAvailability } from '@/plugins/FinTrackNativePlugin';
import { useLockStore } from '@/store/lockStore';
import { LockShell, lockLinkStyle, lockSubtitleStyle, lockTitleStyle } from './LockShell';
import { PinPad } from './PinPad';

function storage(): Storage | null {
    try { return window.localStorage; } catch { return null; }
}

function formatCountdown(ms: number): string {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The lock itself. `unlock` mode is the app lock (AppLockGate); `verify` mode
 * re-confirms the user before a sensitive change (turning lock off, changing
 * the PIN) and can be cancelled. Both share the attempt counter, so a wrong
 * PIN costs the same wherever it is entered.
 */
export function LockScreen({ mode = 'unlock', promptKey = 0, onSuccess, onForgot, onCancel }: {
    mode?: 'unlock' | 'verify';
    promptKey?: number;
    onSuccess: () => void;
    onForgot: () => void;
    onCancel?: () => void;
}) {
    const biometricOn = useLockStore(s => s.settings.biometric);
    const setSettings = useLockStore(s => s.setSettings);
    // 'missing' = there's no usable PIN hash on this phone (encrypted store was
    // reset, or app data restored onto a new phone). Nothing can be checked,
    // so no attempt is ever counted — the only way forward is to log in again.
    const [hashState, setHashState] = useState<'unknown' | 'ok' | 'missing'>('unknown');
    const [view, setView] = useState<'fingerprint' | 'pin'>(biometricOn ? 'fingerprint' : 'pin');
    const [bio, setBio] = useState<BiometricAvailability | null>(null);
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempts, setAttempts] = useState<AttemptState>(() => readAttempts(storage()));
    const [now, setNow] = useState(() => Date.now());
    const prompting = useRef(false);
    const done = useRef(false);

    const cooldownMs = cooldownRemainingMs(attempts, now);
    const coolingDown = cooldownMs > 0;
    const canUseFingerprint = biometricOn && bio === 'available';

    const succeed = useCallback(() => {
        if (done.current) return;
        done.current = true;
        writeAttempts(storage(), NO_ATTEMPTS);
        onSuccess();
    }, [onSuccess]);

    const promptFingerprint = useCallback(async () => {
        if (prompting.current || done.current) return;
        prompting.current = true;
        try {
            const r = await FinTrackNative.authenticate({
                title: mode === 'verify' ? 'Confirm it’s you' : 'Unlock FinTrack',
                subtitle: 'Touch the sensor to see your money',
                negativeText: 'Use PIN',
            });
            if (r.result === 'success') succeed();
            else if (r.result === 'invalidated') {
                // Fingerprints were added/removed since fingerprint unlock was
                // turned on. Stop offering it until re-enabled in Settings.
                setSettings({ biometric: false });
                setError('Fingerprints changed on this phone. Enter your PIN.');
                setView('pin');
            }
            else if (r.result === 'use_pin' || r.result === 'error') setView('pin');
            // 'cancel': stay put; the big fingerprint circle re-opens the prompt.
        } catch {
            setView('pin');
        } finally {
            prompting.current = false;
        }
    }, [mode, succeed, setSettings]);

    // Is there a PIN to check against at all?
    useEffect(() => {
        let cancelled = false;
        FinTrackNative.getPinHash()
            .then(({ hash }) => { if (!cancelled) setHashState(isUsablePinHash(hash) ? 'ok' : 'missing'); })
            .catch(() => { if (!cancelled) setHashState('unknown'); });
        return () => { cancelled = true; };
    }, []);

    // Probe the sensor; if it's usable, open the system prompt straight away.
    useEffect(() => {
        if (!biometricOn) return;
        let cancelled = false;
        FinTrackNative.biometricStatus()
            .then(({ status }) => {
                if (cancelled) return;
                setBio(status);
                if (status !== 'available') setView('pin');
            })
            .catch(() => { if (!cancelled) { setBio('no_hardware'); setView('pin'); } });
        return () => { cancelled = true; };
    }, [biometricOn]);

    // Auto-prompt when the lock appears, and again when the gate asks (the
    // user came back to the app while it was still locked).
    useEffect(() => {
        if (canUseFingerprint && view === 'fingerprint') promptFingerprint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canUseFingerprint, promptKey]);

    // Tick the cooldown countdown.
    useEffect(() => {
        if (!coolingDown) return;
        const id = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(id);
    }, [coolingDown]);

    const checkPin = async (entered: string) => {
        setBusy(true);
        try {
            const { hash } = await FinTrackNative.getPinHash();
            if (!isUsablePinHash(hash)) { setPin(''); setHashState('missing'); return; }
            if (await verifyPin(entered, hash)) { succeed(); return; }
            const t = Date.now();
            const r = registerFailure(readAttempts(storage()), t);
            writeAttempts(storage(), r.state);
            setAttempts(r.state);
            setNow(t);
            setPin('');
            if (r.outcome === 'lockout') { onForgot(); return; }
            if (r.outcome === 'cooldown') { setError(null); return; }
            const left = attemptsLeft(r.state);
            setError(`Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left`);
        } catch {
            setPin('');
            setError('Couldn’t check your PIN. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const onDigit = (d: string) => {
        if (busy || coolingDown || pin.length >= PIN_LENGTH) return;
        const next = pin + d;
        setPin(next);
        setError(null);
        if (next.length === PIN_LENGTH) checkPin(next);
    };

    const cancel = mode === 'verify' && onCancel
        ? <button type="button" onClick={onCancel} style={{ ...lockLinkStyle, color: 'var(--text-secondary)' }}>Cancel</button>
        : undefined;

    if (hashState === 'missing') {
        return (
            <LockShell cover={mode === 'verify'} topAction={cancel}
                footer={<button type="button" onClick={onForgot} style={lockLinkStyle}>Log in again</button>}>
                <div className="glass-surface" aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: 'var(--text-primary)' }}>F</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h1 style={lockTitleStyle}>FinTrack is locked</h1>
                    <p style={lockSubtitleStyle}>Your lock was reset on this phone. Log in again.</p>
                </div>
            </LockShell>
        );
    }

    if (view === 'fingerprint') {
        return (
            <LockShell cover={mode === 'verify'} topAction={cancel}
                footer={<button type="button" onClick={() => setView('pin')} style={lockLinkStyle}>Use PIN instead</button>}>
                <div className="glass-surface" aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: 'var(--text-primary)' }}>F</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h1 style={lockTitleStyle}>{mode === 'verify' ? 'Confirm it’s you' : 'FinTrack is locked'}</h1>
                    <p style={lockSubtitleStyle}>Touch the sensor to see your money</p>
                </div>
                <button type="button" className="glass-surface" aria-label="Unlock with fingerprint" onClick={promptFingerprint}
                    style={{ width: 112, height: 112, borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', marginTop: 'var(--space-4)', padding: 0 }}>
                    <FingerprintPattern size={52} strokeWidth={1.5} />
                </button>
            </LockShell>
        );
    }

    const message = coolingDown
        ? <>Too many tries. Try again in <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{formatCountdown(cooldownMs)}</span></>
        : error;

    return (
        <LockShell cover={mode === 'verify'} topAction={cancel}
            footer={<button type="button" onClick={onForgot} style={lockLinkStyle}>Forgot PIN? Log in again</button>}>
            <PinPad
                title={mode === 'verify' ? 'Enter your current PIN' : 'Enter your PIN'}
                message={message}
                error={!!error || coolingDown}
                length={PIN_LENGTH}
                value={pin}
                onDigit={onDigit}
                onBackspace={() => setPin(p => p.slice(0, -1))}
                onFingerprint={canUseFingerprint ? () => { setView('fingerprint'); promptFingerprint(); } : undefined}
                disabled={busy || coolingDown}
            />
        </LockShell>
    );
}
