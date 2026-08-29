'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Lock, Globe, Palette, ChevronRight, Download, Trash2, Bell, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, aiAPI, transactionsAPI } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useThemeStore } from '@/store/themeStore';
import { exportToCSV } from '@/lib/utils';
import { toast } from '@/store/toastStore';

const CURRENCIES = [
    { code: 'INR', label: 'Indian Rupee (₹)' },
    { code: 'USD', label: 'US Dollar ($)' },
    { code: 'EUR', label: 'Euro (€)' },
    { code: 'GBP', label: 'British Pound (£)' },
    { code: 'AED', label: 'UAE Dirham' },
    { code: 'SGD', label: 'Singapore Dollar' },
];

const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };

function SettingsRow({ icon, label, sub, onClick, destructive }: { icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; destructive?: boolean }) {
    return (
        <button type="button" onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', background: 'none', border: 'none', cursor: onClick ? 'pointer' : 'default', textAlign: 'left' }}>
            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: destructive ? 'color-mix(in srgb, var(--color-exp) 10%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: destructive ? 'var(--color-exp)' : 'var(--accent)' }}>{icon}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 500, color: destructive ? 'var(--color-exp)' : 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{label}</p>
                {sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0', fontFamily: 'var(--font-body)' }}>{sub}</p>}
            </div>
            {onClick && <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
        </button>
    );
}

export default function ProfilePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token, logout } = useAuthStore();
    const { theme, setTheme } = useThemeStore();

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
    const [notifPrefs, setNotifPrefs] = useState({
        budgetAlerts: true,
        billReminders: true,
        goalAlerts: true,
        weeklySummary: true,
    });

    useEffect(() => {
        const val = localStorage.getItem('fintrack-coach-enabled');
        setCoachEnabled(val === null ? true : val === 'true');
    }, []);

    useEffect(() => {
        try {
            const stored = JSON.parse(localStorage.getItem('fintrack-notif-prefs') || '{}');
            setNotifPrefs(prev => ({ ...prev, ...Object.fromEntries(
                Object.keys(prev).map(k => [k, stored[k] !== false])
            )}));
        } catch {}
    }, []);

    const toggleCoach = (enabled: boolean) => {
        setCoachEnabled(enabled);
        localStorage.setItem('fintrack-coach-enabled', String(enabled));
    };

    const toggleNotif = (key: keyof typeof notifPrefs) => {
        const next = { ...notifPrefs, [key]: !notifPrefs[key] };
        setNotifPrefs(next);
        localStorage.setItem('fintrack-notif-prefs', JSON.stringify(next));
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
                ['forecast', 'personality', 'salary_intelligence', 'behavioral_patterns'].map(k => aiAPI.clearCache(k))
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
    const passColor    = passStrength === 'weak' ? 'var(--color-exp)' : passStrength === 'good' ? 'var(--color-warn)' : 'var(--color-inc)';
    const passWidth    = passStrength === 'weak' ? '25%' : passStrength === 'good' ? '60%' : '100%';

    const sectionCard: React.CSSProperties = { borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '12px' };
    const divider: React.CSSProperties = { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' };

    return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '32px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '24px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'white' }}>{initials}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                    {profile?.full_name || user?.full_name || 'User'}
                                </h1>
                                <Badge>Pro Member</Badge>
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {profile?.email || user?.email}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── STATS ROW ── */}
                {!loading && profile && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        {[
                            { label: 'Transactions', value: profile.total_transactions ?? 0 },
                            { label: 'Budgets',      value: profile.total_budgets      ?? 0 },
                            { label: 'Months',       value: monthsTracked },
                        ].map(s => (
                            <div key={s.label} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', textAlign: 'center' }}>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)', margin: '0 0 3px', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                    {s.value}
                                </p>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{s.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── APPEARANCE CARD ── */}
                <div className="glass-surface" style={sectionCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                        <Palette size={16} color="var(--accent)" />
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Appearance</h2>
                    </div>

                    {/* Mode toggle */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>Mode</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', padding: '4px', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderRadius: 'var(--radius-md)', maxWidth: '280px' }}>
                        {([
                            { key: 'light' as const, label: '☀️ Light' },
                            { key: 'dark'  as const, label: '🌙 Dark'  },
                        ]).map(m => (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => setTheme(m.key)}
                                style={{
                                    padding: '9px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: theme === m.key ? 'color-mix(in srgb, var(--text-primary) 12%, transparent)' : 'transparent',
                                    boxShadow: theme === m.key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: '13px', color: 'var(--text-primary)',
                                    fontFamily: 'var(--font-body)',
                                    fontWeight: theme === m.key ? 600 : 400,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── ACCOUNT SECTION ── */}
                <div className="glass-surface" style={sectionCard}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Account</h2>

                    {/* Edit Profile form */}
                    <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>Personal Info</p>
                    <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Input label="Full Name" type="text" placeholder="Your full name" icon={<User size={15} />} value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} required />
                        <Input label="Email Address" type="email" placeholder="your@email.com" icon={<Mail size={15} />} value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} required />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={labelSt}>Currency</label>
                            <div style={{ position: 'relative' }}>
                                <Globe size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <select value={profileForm.currency} onChange={e => setProfileForm({ ...profileForm, currency: e.target.value })}
                                    style={{ ...inputSt, paddingLeft: 36, cursor: 'pointer' }}>
                                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <Button type="submit" isLoading={profileLoading} size="md">Save Changes</Button>
                    </form>

                    {/* Change Password — collapsed behind a row by default; a security
                        action most people touch once a year shouldn't sit permanently
                        open, same reasoning as the add-transaction form's "More details". */}
                    <div style={{ ...divider, margin: '16px 0 0' }} />
                    <button type="button" onClick={() => setPasswordFormOpen(o => !o)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Lock size={15} color="var(--accent)" />
                        </div>
                        <p style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>Change password</p>
                        <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0, transform: passwordFormOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>

                    {passwordFormOpen && (
                        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '4px' }}>
                            <Input label="Current Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.current_password} onChange={e => setPassForm({ ...passForm, current_password: e.target.value })} required />
                            <Input label="New Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.new_password} onChange={e => setPassForm({ ...passForm, new_password: e.target.value })} required />
                            <Input label="Confirm New Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.confirm_password} onChange={e => setPassForm({ ...passForm, confirm_password: e.target.value })} required />
                            {passForm.new_password && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Password strength</span>
                                        <span style={{ fontSize: '11px', color: passColor, fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>{passStrength}</span>
                                    </div>
                                    <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: passWidth, background: passColor, borderRadius: '2px', transition: 'all 0.3s ease' }} />
                                    </div>
                                </div>
                            )}
                            <Button type="submit" variant="secondary" isLoading={passLoading} size="md">Update Password</Button>
                        </form>
                    )}
                </div>

                {/* ── PREFERENCES SECTION (Data + App merged — each was a full card
                     shell for one or two rows) ── */}
                <div className="glass-surface" style={sectionCard}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Preferences</h2>
                    <div style={divider} />
                    <SettingsRow icon={<Download size={16} />} label="Export Data" sub="Download all transactions as CSV" onClick={exporting ? undefined : handleExport} />
                    <div style={divider} />
                    <SettingsRow icon={<Trash2 size={16} />} label="Clear AI Cache" sub="Force-refresh AI analysis results" onClick={clearingCache ? undefined : handleClearCache} />
                    <div style={divider} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Zap size={16} color="var(--accent)" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>Proactive spending alerts</p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0', fontFamily: 'var(--font-body)' }}>Budget warnings and coaching on dashboard</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={coachEnabled}
                            onClick={() => toggleCoach(!coachEnabled)}
                            style={{ position: 'relative', width: '44px', height: '24px', borderRadius: '12px', background: coachEnabled ? 'var(--accent)' : 'var(--border-subtle)', border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                        >
                            <span style={{ position: 'absolute', top: '2px', left: coachEnabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'block' }} />
                        </button>
                    </div>
                </div>

                {/* ── NOTIFICATIONS SECTION ── */}
                <div className="glass-surface" style={sectionCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Bell size={16} color="var(--accent)" />
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Notifications</h2>
                    </div>
                    {([
                        { key: 'budgetAlerts' as const,  label: 'Budget alerts',          sub: 'When a category exceeds 80% of budget' },
                        { key: 'billReminders' as const, label: 'Bill due reminders',      sub: '3 days before a recurring bill is due' },
                        { key: 'goalAlerts' as const,    label: 'Goal milestone alerts',   sub: 'At 25%, 50%, 75%, and 100% funded' },
                        { key: 'weeklySummary' as const, label: 'Weekly spending summary', sub: 'Every Sunday with your week\'s totals' },
                    ]).map(({ key, label, sub }, i, arr) => (
                        <div key={key}>
                            <div style={divider} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{label}</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0', fontFamily: 'var(--font-body)' }}>{sub}</p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={notifPrefs[key]}
                                    onClick={() => toggleNotif(key)}
                                    style={{ position: 'relative', width: '44px', height: '24px', borderRadius: '12px', background: notifPrefs[key] ? 'var(--accent)' : 'var(--border-subtle)', border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                                >
                                    <span style={{ position: 'absolute', top: '2px', left: notifPrefs[key] ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'block' }} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── SIGN OUT ── */}
                <button
                    type="button"
                    onClick={() => { logout(); router.push('/login'); }}
                    style={{ width: '100%', padding: '14px', background: 'color-mix(in srgb, var(--color-exp) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', borderRadius: 'var(--radius-lg)', color: 'var(--color-exp)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-exp) 14%, transparent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-exp) 8%, transparent)'; }}
                >
                    Sign Out
                </button>

            </div>
    );
}
