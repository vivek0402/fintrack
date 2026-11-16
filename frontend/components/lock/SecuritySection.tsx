'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GRACE_OPTIONS, NO_ATTEMPTS, writeAttempts } from '@/lib/appLock';
import { FinTrackNative, BiometricAvailability } from '@/plugins/FinTrackNativePlugin';
import { useAuthStore } from '@/store/authStore';
import { useLockStore } from '@/store/lockStore';
import { toast } from '@/store/toastStore';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, Switch, TextAction } from '@/components/ui/CardParts';
import { type } from '@/lib/typography';
import { LockScreen } from './LockScreen';
import { PinSetup } from './PinSetup';
import { isUnimplementedError, useIsNative } from './useIsNative';

type Flow = null | 'enable' | 'disable' | 'change-verify' | 'change-set';

function ToggleRow({ label, sub, checked, onChange, disabled }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...type.bodyStrong, margin: 0 }}>{label}</p>
                <p style={{ ...type.meta, margin: '2px 0 0' }}>{sub}</p>
            </div>
            <Switch checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
        </div>
    );
}

/**
 * Profile → Security. Android app only; renders nothing on web/PWA, nor in
 * an older installed APK that predates the app-lock plugin methods (the web
 * code is loaded remotely, so it can be newer than the app): there, setting a
 * PIN could never be saved.
 */
export function SecuritySection() {
    const isNative = useIsNative();
    const router = useRouter();
    const settings = useLockStore(s => s.settings);
    const setSettings = useLockStore(s => s.setSettings);
    const [bio, setBio] = useState<BiometricAvailability | null>(null);
    // null = still probing; false = this APK has no app-lock support.
    const [supported, setSupported] = useState<boolean | null>(null);
    const [flow, setFlow] = useState<Flow>(null);

    useEffect(() => {
        if (!isNative) return;
        let cancelled = false;
        FinTrackNative.biometricStatus()
            .then(r => { if (!cancelled) { setBio(r.status); setSupported(true); } })
            .catch(err => {
                if (cancelled) return;
                if (isUnimplementedError(err)) { setSupported(false); return; }
                setBio('no_hardware');
                setSupported(true);
            });
        return () => { cancelled = true; };
    }, [isNative]);

    if (!isNative || supported !== true) return null;

    const bioAvailable = bio === 'available';
    const off = !settings.enabled;

    // Fingerprint unlock is bound to a fresh Keystore key; if it can't be
    // made, fingerprint stays off and the PIN still works.
    const makeBiometricKey = async () => {
        try { return (await FinTrackNative.enableBiometricKey()).ok; } catch { return false; }
    };

    const finishEnable = async (hash: string) => {
        await FinTrackNative.setPinHash({ hash });
        const biometric = bioAvailable && await makeBiometricKey();
        setSettings({ enabled: true, biometric, hideRecents: true });
        await FinTrackNative.setSecureFlag({ enabled: true }).catch(() => {});
        try { writeAttempts(window.localStorage, NO_ATTEMPTS); } catch { /* ignore */ }
        // Counts as unlocked for this session, so an in-app reload won't prompt.
        useLockStore.getState().unlock();
        setFlow(null);
        toast.success('App lock is on');
    };

    const finishChange = async (hash: string) => {
        await FinTrackNative.setPinHash({ hash });
        setFlow(null);
        toast.success('PIN changed');
    };

    const disable = () => {
        useLockStore.getState().reset();
        setFlow(null);
        toast.success('App lock is off');
    };

    const forgot = () => {
        setFlow(null);
        useAuthStore.getState().logout();
        router.replace('/login');
    };

    const setFingerprint = async (v: boolean) => {
        if (!v) {
            setSettings({ biometric: false });
            FinTrackNative.deleteBiometricKey().catch(() => {});
            return;
        }
        if (await makeBiometricKey()) setSettings({ biometric: true });
        else toast.error('Couldn’t turn on fingerprint unlock');
    };

    const setHideRecents = (v: boolean) => {
        setSettings({ hideRecents: v });
        FinTrackNative.setSecureFlag({ enabled: v }).catch(() => {});
    };

    return (
        <Card>
            <CardHeader title="Security" sub="Android app only" />
            <Rows>
                <ToggleRow label="App lock" sub="Ask to unlock when FinTrack opens" checked={settings.enabled}
                    onChange={v => setFlow(v ? 'enable' : 'disable')} />
                <ToggleRow label="Use fingerprint"
                    sub={bio !== null && !bioAvailable ? 'No fingerprint set up on this phone' : 'PIN still works as a backup'}
                    checked={settings.enabled && settings.biometric && bioAvailable}
                    onChange={setFingerprint}
                    disabled={off || !bioAvailable} />
                <div>
                    <p style={{ ...type.bodyStrong, margin: 0, flex: 1 }}>PIN</p>
                    <TextAction onClick={() => setFlow('change-verify')} disabled={off}>Change PIN</TextAction>
                </div>
                <div style={{ display: 'block' }}>
                    <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Lock after leaving the app</p>
                    <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                        <div className="fin-tabs" role="radiogroup" aria-label="Lock after leaving the app">
                            {GRACE_OPTIONS.map(o => (
                                <button key={o.ms} type="button" role="radio" className="fin-tab" aria-checked={settings.graceMs === o.ms} disabled={off}
                                    onClick={() => setSettings({ graceMs: o.ms })}>
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <ToggleRow label="Hide in recent apps" sub="Blank preview in the app switcher. Also blocks screenshots."
                    checked={settings.enabled && settings.hideRecents} onChange={setHideRecents} disabled={off} />
            </Rows>

            {flow === 'enable' && (
                <PinSetup onDone={finishEnable} onCancel={() => setFlow(null)} biometricAvailable={bioAvailable} />
            )}
            {flow === 'change-set' && (
                <PinSetup onDone={finishChange} onCancel={() => setFlow(null)} biometricAvailable={bioAvailable} />
            )}
            {(flow === 'disable' || flow === 'change-verify') && (
                <LockScreen mode="verify"
                    onSuccess={() => (flow === 'disable' ? disable() : setFlow('change-set'))}
                    onForgot={forgot}
                    onCancel={() => setFlow(null)} />
            )}
        </Card>
    );
}
