'use client';

import { useState } from 'react';
import { PIN_LENGTH, hashPin } from '@/lib/appLock';
import { LockShell, lockLinkStyle } from './LockShell';
import { PinPad } from './PinPad';

/**
 * "Choose a PIN" → "Confirm your PIN". Hands back only the PBKDF2 hash.
 * `biometricAvailable`: a fingerprint is enrolled on this phone, so the PIN is
 * the fallback; otherwise it's simply how FinTrack unlocks.
 */
export function PinSetup({ onDone, onCancel, biometricAvailable = false }: {
    onDone: (hash: string) => Promise<void> | void;
    onCancel: () => void;
    biometricAvailable?: boolean;
}) {
    const [first, setFirst] = useState<string | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const onDigit = async (d: string) => {
        if (busy || pin.length >= PIN_LENGTH) return;
        const next = pin + d;
        setPin(next);
        setError(null);
        if (next.length < PIN_LENGTH) return;

        if (first === null) {
            setFirst(next);
            setPin('');
            return;
        }
        if (next !== first) {
            setFirst(null);
            setPin('');
            setError('PINs didn’t match. Try again.');
            return;
        }
        setBusy(true);
        try {
            await onDone(await hashPin(next));
        } catch {
            setFirst(null);
            setPin('');
            setError('Couldn’t save your PIN. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const confirming = first !== null;
    const intro = biometricAvailable
        ? 'You’ll use this when your fingerprint isn’t available'
        : 'You’ll use this to unlock FinTrack';

    return (
        <LockShell cover
            topAction={<button type="button" onClick={onCancel} style={{ ...lockLinkStyle, color: 'var(--text-secondary)' }}>Cancel</button>}>
            <PinPad
                title={confirming ? 'Confirm your PIN' : 'Choose a PIN'}
                message={error ?? (confirming ? 'Enter the same 4 digits again' : intro)}
                error={!!error}
                length={PIN_LENGTH}
                value={pin}
                onDigit={onDigit}
                onBackspace={() => setPin(p => p.slice(0, -1))}
                disabled={busy}
            />
        </LockShell>
    );
}
