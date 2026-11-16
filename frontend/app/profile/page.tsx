'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, aiAPI, transactionsAPI } from '@/lib/api';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, Stat, Switch, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Tabs } from '@/components/ui/Tabs';
import { type, truncate } from '@/lib/typography';
import { useThemeStore } from '@/store/themeStore';
import { exportToCSV } from '@/lib/utils';
import { toast } from '@/store/toastStore';
import { SecuritySection } from '@/components/lock/SecuritySection';
import {
    DEFAULT_NOTIF_PREFS, NotificationPrefs, cacheNotifPrefs, loadNotificationPrefs, mergeLoadedPrefs,
    readCachedNotifPrefs, revertPref, saveNotificationPref,
} from '@/lib/notificationPrefs';

const CURRENCIES = [
    { code: 'INR', label: 'Indian Rupee (₹)' },
    { code: 'USD', label: 'US Dollar ($)' },
    { code: 'EUR', label: 'Euro (€)' },
    { code: 'GBP', label: 'British Pound (£)' },
    { code: 'AED', label: 'UAE Dirham' },
    { code: 'SGD', label: 'Singapore Dollar' },
];

const NOTIF_ROWS = [
    { key: 'budgetAlerts' as const,  label: 'Budget alerts',          sub: 'When a category exceeds 80% of budget' },
    { key: 'billReminders' as const, label: 'Bill due reminders',      sub: '3 days before a recurring bill is due' },
    { key: 'goalAlerts' as const,    label: 'Goal milestone alerts',   sub: 'At 25%, 50%, 75%, and 100% funded' },
    { key: 'weeklySummary' as const, label: 'Weekly spending summary', sub: 'Every Sunday with your week\'s totals' },
];

const selectStyle: React.CSSProperties = {
    ...type.body, color: 'var(--text-primary)', width: '100%', height: 40, padding: '0 var(--space-3)',
    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
};

export default function ProfilePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token, logout } = useAuthStore();
    const { theme, setTheme, moreMenuStyle, setMoreMenuStyle } = useThemeStore();

    const [profile, setProfile]         = useState<any>(null);
    const [loading, setLoading]         = useState(true);
    const [profileForm, setProfileForm] = useState({ full_name: '', email: '', currency: 'INR' });
    const [profileLoading, setProfileLoading] = useState(false);
    const [passForm, setPassForm]       = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [passLoading, setPassLoading] = useState(false);
    const [passwordFormOpen, setPasswordFormOpen] = useState(false);
    const [exporting, setExporting]     = useState(false);
    const [clearingCache, setClearingCache] = useState(false);
    const [coachEnabled, setCoachEnabled]   = useState(true);
    const [notifPrefs, setNotifPrefsState] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
    // Ref mirror so async load/save callbacks see the latest toggles, plus the
    // keys the user has toggled this visit (the initial load must not undo them).
    const notifPrefsRef = useRef<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
    const touchedNotifKeys = useRef<Set<keyof NotificationPrefs>>(new Set());
    const notifToggleSeq = useRef<Partial<Record<keyof NotificationPrefs, number>>>({});
    const setNotifPrefs = (next: NotificationPrefs) => {
        notifPrefsRef.current = next;
        setNotifPrefsState(next);
    };

    useEffect(() => {
        const val = localStorage.getItem('fintrack-coach-enabled');
        setCoachEnabled(val === null ? true : val === 'true');
    }, []);

    useEffect(() => {
        // Paint the cached toggles immediately, then settle on the server copy.
        const cached = readCachedNotifPrefs();
        if (cached) setNotifPrefs(cached);
        loadNotificationPrefs().then(loaded => {
            const touched = touchedNotifKeys.current;
            const merged = mergeLoadedPrefs(loaded, notifPrefsRef.current, touched);
            setNotifPrefs(merged);
            // The load re-cached the server copy; keep in-flight toggles cached too.
            if (touched.size) cacheNotifPrefs(merged);
        }).catch(() => {});
    }, []);

    const toggleCoach = (enabled: boolean) => {
        setCoachEnabled(enabled);
        localStorage.setItem('fintrack-coach-enabled', String(enabled));
    };

    const toggleNotif = (key: keyof NotificationPrefs) => {
        const value = !notifPrefsRef.current[key];
        touchedNotifKeys.current.add(key);
        const seq = (notifToggleSeq.current[key] ?? 0) + 1;
        notifToggleSeq.current[key] = seq;
        const next = { ...notifPrefsRef.current, [key]: value };
        setNotifPrefs(next);
        saveNotificationPref(key, value, next).catch(() => {
            toast.error('Could not save notification settings');
            // A newer toggle of this key supersedes this failed save.
            if (notifToggleSeq.current[key] !== seq) return;
            const reverted = revertPref(notifPrefsRef.current, key, value);
            if (reverted !== notifPrefsRef.current) {
                setNotifPrefs(reverted);
                cacheNotifPrefs(reverted);
            }
        });
    };

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        profileAPI.get().then(res => {
            setProfile(res.data.profile);
            setProfileForm({ full_name: res.data.profile.full_name, email: res.data.profile.email, currency: res.data.profile.currency });
        }).catch(err => { console.error(err); toast.error('Failed to load profile'); }).finally(() => setLoading(false));
    }, [user]);

    // ── Handlers (logic unchanged) ────────────────────────────────────────────
    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault(); setProfileLoading(true);
        try {
            const res = await profileAPI.update(profileForm);
            if (token) setAuth(res.data.user, token);
            toast.success('Profile updated');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to update.');
        } finally { setProfileLoading(false); }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passForm.new_password !== passForm.confirm_password) {
            toast.error('Passwords do not match'); return;
        }
        setPassLoading(true);
        try {
            await profileAPI.changePassword({ current_password: passForm.current_password, new_password: passForm.new_password });
            setPassForm({ current_password: '', new_password: '', confirm_password: '' });
            toast.success('Password changed');
            setPasswordFormOpen(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to change password.');
        } finally { setPassLoading(false); }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await transactionsAPI.getAll({});
            await exportToCSV(res.data.transactions, `fintrack-export-${new Date().getFullYear()}.csv`);
            toast.success('Export ready');
        } catch { toast.error('Export failed'); }
        finally { setExporting(false); }
    };

    const handleClearCache = async () => {
        setClearingCache(true);
        try {
            const results = await Promise.allSettled(
                ['forecast', 'salary_intelligence', 'behavioral_patterns'].map(k => aiAPI.clearCache(k))
            );
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) toast.error(`AI cache partially cleared (${failed} failed)`);
            else toast.success('AI cache cleared');
        } catch { toast.error('Failed to clear cache'); }
        finally { setClearingCache(false); }
    };

    if (isLoading || !user) return (
        <>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <SkeletonCard height={64} />
                <SkeletonCard height={64} />
                <SkeletonCard height={64} />
            </div>
            {[1, 2, 3].map(i => <SkeletonCard key={i} height={80} style={{ marginBottom: '12px' }} />)}
        </>
    );

    const initials = profile?.full_name
        ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : user?.full_name?.[0]?.toUpperCase() || '?';

    const monthsTracked = profile?.created_at
        ? Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : 1;

    const passStrength = passForm.new_password.length < 6 ? 'weak' : passForm.new_password.length < 10 ? 'good' : 'strong';
    const passTone = passStrength === 'weak' ? 'bad' : passStrength === 'good' ? 'caution' : 'good';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)', animation: 'fadeUp 200ms ease forwards' }}>

            <div className="fin-page-head">
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.meta, margin: 0 }}>Your account and how the app behaves</p>
                    <h1 style={{ ...type.heading, margin: 0 }}>Profile</h1>
                </div>
                <div className="fin-page-actions">
                    <Button variant="secondary" onClick={() => { logout(); router.push('/login'); }}>Sign out</Button>
                </div>
            </div>

            <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ ...type.heading, color: '#fff' }}>{initials}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ ...type.heading, margin: 0, ...truncate }}>{profile?.full_name || user?.full_name || 'User'}</h2>
                        <p style={{ ...type.meta, margin: '2px 0 0', ...truncate }}>{profile?.email || user?.email}</p>
                    </div>
                </div>
                {!loading && profile && (
                    <div className="dash-stats">
                        <Stat className="dash-stat" label="Transactions" value={profile.total_transactions ?? 0} />
                        <Stat className="dash-stat" label="Budgets" value={profile.total_budgets ?? 0} />
                        <Stat className="dash-stat" label="Months tracked" value={monthsTracked} />
                    </div>
                )}
            </Card>

            <div className="fin-two">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                    <Card>
                        <CardHeader title="Account" sub="Your name, email and currency" />
                        <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <Input label="Full name" type="text" placeholder="Your full name" value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} required />
                            <Input label="Email" type="email" placeholder="your@email.com" value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} required />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                <label htmlFor="profile-currency" style={type.label}>Currency</label>
                                <select id="profile-currency" value={profileForm.currency} onChange={e => setProfileForm({ ...profileForm, currency: e.target.value })} style={selectStyle}>
                                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                </select>
                            </div>
                            <Button type="submit" isLoading={profileLoading} size="md">Save changes</Button>
                        </form>

                        {/* Change password stays collapsed: a security action most people touch
                            once a year shouldn't sit permanently open. */}
                        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--glass-border)' }}>
                            <TextAction onClick={() => setPasswordFormOpen(o => !o)} aria-expanded={passwordFormOpen} aria-controls="profile-password-form">
                                Change password
                            </TextAction>
                        </div>

                        {passwordFormOpen && (
                            <form id="profile-password-form" onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingTop: 'var(--space-2)' }}>
                                <Input label="Current password" type="password" placeholder="••••••••" value={passForm.current_password} onChange={e => setPassForm({ ...passForm, current_password: e.target.value })} required />
                                <Input label="New password" type="password" placeholder="••••••••" value={passForm.new_password} onChange={e => setPassForm({ ...passForm, new_password: e.target.value })} required />
                                <Input label="Confirm new password" type="password" placeholder="••••••••" value={passForm.confirm_password} onChange={e => setPassForm({ ...passForm, confirm_password: e.target.value })} required />
                                {passForm.new_password && (
                                    <p style={{ ...type.meta, margin: 0 }}>
                                        Strength: <span style={{ color: TONE_TEXT[passTone] }}>{passStrength}</span>
                                    </p>
                                )}
                                <Button type="submit" variant="secondary" isLoading={passLoading} size="md">Update password</Button>
                            </form>
                        )}
                    </Card>

                    <Card>
                        <CardHeader title="Your data" sub="Take it with you, or refresh the AI" />
                        <Rows>
                            <div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, margin: 0 }}>Export data</p>
                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>Download all transactions as CSV</p>
                                </div>
                                <TextAction onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting' : 'Export CSV'}</TextAction>
                            </div>
                            <div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, margin: 0 }}>Clear AI cache</p>
                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>Force-refresh AI analysis results</p>
                                </div>
                                <TextAction onClick={handleClearCache} disabled={clearingCache}>{clearingCache ? 'Clearing' : 'Clear cache'}</TextAction>
                            </div>
                        </Rows>
                    </Card>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                    <Card>
                        <CardHeader title="Appearance" sub="How the app looks" />
                        <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Mode</p>
                        <Tabs
                            tabs={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]}
                            active={theme}
                            onChange={k => setTheme(k as 'light' | 'dark')}
                        />
                        <p style={{ ...type.label, margin: 'var(--space-4) 0 var(--space-2)' }}>More menu</p>
                        <Tabs
                            tabs={[{ key: 'grid', label: 'Grid' }, { key: 'list', label: 'List' }]}
                            active={moreMenuStyle}
                            onChange={k => setMoreMenuStyle(k as 'grid' | 'list')}
                        />
                        <p style={{ ...type.meta, margin: 'var(--space-2) 0 0' }}>
                            Grid is quickest to scan. List shows a live figure next to each page.
                        </p>
                    </Card>

                    <Card>
                        <CardHeader title="Notifications" sub="What the app tells you about" />
                        <Rows>
                            <div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, margin: 0 }}>Spending alerts on the dashboard</p>
                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>Budget warnings and coaching</p>
                                </div>
                                <Switch checked={coachEnabled} onChange={toggleCoach} aria-label="Spending alerts on the dashboard" />
                            </div>
                            {NOTIF_ROWS.map(({ key, label, sub }) => (
                                <div key={key}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ ...type.bodyStrong, margin: 0 }}>{label}</p>
                                        <p style={{ ...type.meta, margin: '2px 0 0' }}>{sub}</p>
                                    </div>
                                    <Switch checked={notifPrefs[key]} onChange={() => toggleNotif(key)} aria-label={label} />
                                </div>
                            ))}
                        </Rows>
                    </Card>

                    {/* Android app only; renders nothing on web. */}
                    <SecuritySection />
                </div>
            </div>
        </div>
    );
}
