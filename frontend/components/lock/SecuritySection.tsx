'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Shield } from 'lucide-react';
import { GRACE_OPTIONS, NO_ATTEMPTS, writeAttempts } from '@/lib/appLock';
import { FinTrackNative, BiometricAvailability } from '@/plugins/FinTrackNativePlugin';
import { useAuthStore } from '@/store/authStore';
import { useLockStore } from '@/store/lockStore';
import { toast } from '@/store/toastStore';
import { LockScreen } from './LockScreen';
import { PinSetup } from './PinSetup';
import { useIsNative } from './useIsNative';

type Flow = null | 'enable' | 'disable' | 'change-verify' | 'change-set';

const divider: React.CSSProperties = { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' };
const rowLabel: React.CSSProperties = { fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' };
const rowSub: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0', fontFamily: 'var(--font-body)' };

// Same switch as the Profile page's notification and alert rows.
function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
    return (
        <button
            type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
            onClick={() => onChange(!checked)}
            style={{ position: 'relative', width: '44px', height: '24px', borderRadius: '12px', background: checked ? 'var(--accent)' : 'var(--border-subtle)', border: 'none', cursor: disabled ? 'default' : 'pointer', transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1 }}
        >
            <span style={{ position: 'absolute', top: '2px', left: checked ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'block' }} />
        </button>
    );
}

function ToggleRow({ label, sub, checked, onChange, disabled }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', opacity: disabled ? 0.6 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={rowLabel}>{label}</p>
                <p style={rowSub}>{sub}</p>
            </div>
            <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
        </div>
    );
}

/** Profile → Security. Android app only; renders nothing on web/PWA. */
export function SecuritySection() {
    const isNative = useIsNative();
    const router = useRouter();
    const settings = useLockStore(s => s.settings);
    const setSettings = useLockStore(s => s.setSettings);
    const [bio, setBio] = useState<BiometricAvailability | null>(null);
    const [flow, setFlow] = useState<Flow>(null);

    useEffect(() => {
        if (!isNative) return;
        FinTrackNative.biometricStatus()
            .then(r => setBio(r.status))
            .catch(() => setBio('no_hardware'));
    }, [isNative]);

    if (!isNative) return null;

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
        <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Shield size={16} color="var(--accent)" />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Security</h2>
            </div>

            <div style={divider} />
            <ToggleRow label="App lock" sub="Ask to unlock when FinTrack opens" checked={settings.enabled}
                onChange={v => setFlow(v ? 'enable' : 'disable')} />

            <div style={divider} />
            <ToggleRow label="Use fingerprint"
                sub={bio !== null && !bioAvailable ? 'No fingerprint set up on this phone' : 'PIN still works as a backup'}
                checked={settings.enabled && settings.biometric && bioAvailable}
                onChange={setFingerprint}
                disabled={off || !bioAvailable} />

            <div style={divider} />
            <button type="button" disabled={off} onClick={() => setFlow('change-verify')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', background: 'none', border: 'none', cursor: off ? 'default' : 'pointer', textAlign: 'left', opacity: off ? 0.6 : 1 }}>
                <p style={{ ...rowLabel, flex: 1 }}>Change PIN</p>
                <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            </button>

            <div style={divider} />
            <div style={{ padding: '12px 0', opacity: off ? 0.6 : 1 }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>Lock after leaving the app</p>
                <div role="radiogroup" aria-label="Lock after leaving the app" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', padding: '4px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)' }}>
                    {GRACE_OPTIONS.map(o => {
                        const selected = settings.graceMs === o.ms;
                        return (
                            <button key={o.ms} type="button" role="radio" aria-checked={selected} disabled={off}
                                onClick={() => setSettings({ graceMs: o.ms })}
                                style={{
                                    padding: '9px 8px', borderRadius: 'var(--radius-sm)',
                                    background: selected ? 'var(--glass-fill-3)' : 'transparent',
                                    border: 'none', cursor: off ? 'default' : 'pointer',
                                    fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                                    fontWeight: selected ? 600 : 400, transition: 'all 0.15s',
                                }}>
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={divider} />
            <ToggleRow label="Hide in recent apps" sub="Blank preview in the app switcher. Also blocks screenshots."
                checked={settings.enabled && settings.hideRecents} onChange={setHideRecents} disabled={off} />

            {flow === 'enable' && (
                <PinSetup onDone={finishEnable} onCancel={() => setFlow(null)} />
            )}
            {flow === 'change-set' && (
                <PinSetup onDone={finishChange} onCancel={() => setFlow(null)} />
            )}
            {(flow === 'disable' || flow === 'change-verify') && (
                <LockScreen mode="verify"
                    onSuccess={() => (flow === 'disable' ? disable() : setFlow('change-set'))}
                    onForgot={forgot}
                    onCancel={() => setFlow(null)} />
            )}
        </div>
    );
}
