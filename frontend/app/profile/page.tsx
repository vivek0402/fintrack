'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Lock, Globe, CheckCircle, AlertCircle, Palette, ChevronRight, ChevronDown, Check, Download, Trash2, FileText, Bell, Receipt } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, aiAPI, transactionsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useThemeStore } from '@/store/themeStore';
import type { PaletteName } from '@/store/themeStore';
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

const PALETTE_DEFS: { name: PaletteName; color: string; label: string; desc: string }[] = [
    { name: 'ember',  color: '#ea580c', label: 'Ember',  desc: 'Warm orange' },
    { name: 'ocean',  color: '#0284c7', label: 'Ocean',  desc: 'Sky blue' },
    { name: 'violet', color: '#7c3aed', label: 'Violet', desc: 'Rich purple' },
    { name: 'forest', color: '#059669', label: 'Forest', desc: 'Emerald green' },
    { name: 'rose',   color: '#e11d48', label: 'Rose',   desc: 'Rose red' },
];

const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };

function Msg({ msg }: { msg: { type: 'success' | 'error'; text: string } }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: msg.type === 'success' ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: `1px solid ${msg.type === 'success' ? 'color-mix(in srgb, var(--color-inc) 20%, transparent)' : 'color-mix(in srgb, var(--color-exp) 20%, transparent)'}`, fontSize: '12px', color: msg.type === 'success' ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>
            {msg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {msg.text}
        </div>
    );
}

function SettingsRow({ icon, label, sub, onClick, destructive }: { icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; destructive?: boolean }) {
    return (
        <button type="button" onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', background: 'none', border: 'none', cursor: onClick ? 'pointer' : 'default', textAlign: 'left' }}>
            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: destructive ? 'color-mix(in srgb, var(--color-exp) 10%, transparent)' : 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

// ── Palette Dropdown ──────────────────────────────────────────────────────────
function PaletteDropdown({ value, onChange }: { value: PaletteName; onChange: (p: PaletteName) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open]);

    const current = PALETTE_DEFS.find(p => p.name === value);

    return (
        <div ref={ref} style={{ position: 'relative', marginBottom: '4px' }}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', width: '100%', transition: 'border-color var(--transition-fast)' }}
                onFocus={e  => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e   => (e.currentTarget.style.borderColor = open ? 'var(--accent)' : 'var(--border)')}
            >
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: current?.color, flexShrink: 0, border: '2px solid rgba(255,255,255,0.15)' }} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                    {current?.label}
                </span>
                <ChevronDown size={14} color="var(--text-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
            </button>

            {/* Dropdown panel */}
            {open && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-elevated)', zIndex: 200, overflow: 'hidden', animation: 'fadeUp 120ms ease forwards' }}>
                    {PALETTE_DEFS.map(p => {
                        const isActive = value === p.name;
                        return (
                            <button key={p.name} type="button"
                                onClick={() => { onChange(p.name); setOpen(false); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', width: '100%', background: isActive ? 'var(--accent-light)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'background var(--transition-fast)', borderBottom: '1px solid var(--border)' }}
                                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                {/* Swatch */}
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: p.color, flexShrink: 0, border: '2px solid rgba(255,255,255,0.15)', boxShadow: isActive ? `0 0 6px ${p.color}80` : 'none' }} />
                                {/* Label + description */}
                                <div style={{ flex: 1, textAlign: 'left' }}>
                                    <p style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--accent)' : 'var(--text-primary)', margin: '0 0 1px', textTransform: 'capitalize', fontFamily: 'var(--font-body)' }}>{p.label}</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{p.desc}</p>
                                </div>
                                {/* Check */}
                                {isActive && <Check size={15} color="var(--accent)" style={{ flexShrink: 0 }} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function ProfilePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token, logout } = useAuthStore();
    const { theme, palette, setTheme, setPalette } = useThemeStore();

    const [profile, setProfile]         = useState<any>(null);
    const [loading, setLoading]         = useState(true);
    const [profileForm, setProfileForm] = useState({ full_name: '', email: '', currency: 'INR' });
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileMsg, setProfileMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [passForm, setPassForm]       = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [passLoading, setPassLoading] = useState(false);
    const [passMsg, setPassMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [exporting, setExporting]     = useState(false);
    const [clearingCache, setClearingCache] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        profileAPI.get().then(res => {
            setProfile(res.data.profile);
            setProfileForm({ full_name: res.data.profile.full_name, email: res.data.profile.email, currency: res.data.profile.currency });
        }).catch(console.error).finally(() => setLoading(false));
    }, [user]);

    // ── Handlers (logic unchanged) ────────────────────────────────────────────
    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault(); setProfileMsg(null); setProfileLoading(true);
        try {
            const res = await profileAPI.update(profileForm);
            if (token) setAuth(res.data.user, token);
            toast.success('Profile updated');
            setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to update.';
            toast.error(msg); setProfileMsg({ type: 'error', text: msg });
        } finally { setProfileLoading(false); }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault(); setPassMsg(null);
        if (passForm.new_password !== passForm.confirm_password) {
            toast.error('Passwords do not match'); setPassMsg({ type: 'error', text: 'Passwords do not match.' }); return;
        }
        setPassLoading(true);
        try {
            await profileAPI.changePassword({ current_password: passForm.current_password, new_password: passForm.new_password });
            setPassForm({ current_password: '', new_password: '', confirm_password: '' });
            toast.success('Password changed'); setPassMsg({ type: 'success', text: 'Password changed successfully.' });
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to change password.';
            toast.error(msg); setPassMsg({ type: 'error', text: msg });
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
            await Promise.allSettled(['report', 'personality', 'salary-intelligence', 'forecast-calendar', 'health-report'].map(k => aiAPI.clearCache(k)));
            toast.success('AI cache cleared');
        } catch { toast.error('Failed to clear cache'); }
        finally { setClearingCache(false); }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <SkeletonCard height={64} />
                <SkeletonCard height={64} />
                <SkeletonCard height={64} />
            </div>
            {[1, 2, 3].map(i => <SkeletonCard key={i} height={80} style={{ marginBottom: '12px' }} />)}
        </AppLayout>
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

    const sectionCard: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '12px' };
    const divider: React.CSSProperties = { height: '1px', background: 'var(--border)', margin: '8px 0' };

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '32px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px 20px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, background: 'var(--bg-glow)', borderRadius: '50%', opacity: 0.35, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
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
                            <GCard key={s.label} style={{ textAlign: 'center' }}>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)', margin: '0 0 3px', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                    {s.value}
                                </p>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{s.label}</p>
                            </GCard>
                        ))}
                    </div>
                )}

                {/* ── APPEARANCE CARD ── */}
                <div style={sectionCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                        <Palette size={16} color="var(--accent)" />
                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Appearance</h2>
                    </div>

                    {/* Colour dropdown */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>Colour</p>
                    <PaletteDropdown value={palette} onChange={setPalette} />
                    <div style={{ height: '18px' }} />

                    {/* Mode toggle */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>Mode</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', padding: '4px', background: 'var(--bg-alt)', borderRadius: 'var(--radius-md)', maxWidth: '280px' }}>
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
                                    background: theme === m.key ? 'var(--bg-card)' : 'transparent',
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
                <div style={sectionCard}>
                    <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Account</h2>

                    {/* Edit Profile form */}
                    <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>Personal Info</p>
                    <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
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
                        {profileMsg && <Msg msg={profileMsg} />}
                        <Button type="submit" isLoading={profileLoading} size="md">Save Changes</Button>
                    </form>

                    <div style={divider} />

                    {/* Change Password form */}
                    <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '12px 0', fontFamily: 'var(--font-body)' }}>Change Password</p>
                    <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Input label="Current Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.current_password} onChange={e => setPassForm({ ...passForm, current_password: e.target.value })} required />
                        <Input label="New Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.new_password} onChange={e => setPassForm({ ...passForm, new_password: e.target.value })} required />
                        <Input label="Confirm New Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.confirm_password} onChange={e => setPassForm({ ...passForm, confirm_password: e.target.value })} required />
                        {passForm.new_password && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Password strength</span>
                                    <span style={{ fontSize: '11px', color: passColor, fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>{passStrength}</span>
                                </div>
                                <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: passWidth, background: passColor, borderRadius: '2px', transition: 'all 0.3s ease' }} />
                                </div>
                            </div>
                        )}
                        {passMsg && <Msg msg={passMsg} />}
                        <Button type="submit" variant="secondary" isLoading={passLoading} size="md">Update Password</Button>
                    </form>
                </div>

                {/* ── DATA SECTION ── */}
                <div style={sectionCard}>
                    <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Data</h2>
                    <div style={divider} />
                    <SettingsRow icon={<Download size={16} />} label="Export Data" sub="Download all transactions as CSV" onClick={exporting ? undefined : handleExport} />
                    <div style={divider} />
                    <SettingsRow icon={<Trash2 size={16} />} label="Clear AI Cache" sub="Force-refresh AI analysis results" onClick={clearingCache ? undefined : handleClearCache} />
                </div>

                {/* ── APP SECTION ── */}
                <div style={sectionCard}>
                    <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>App</h2>
                    <div style={divider} />
                    <SettingsRow icon={<Receipt size={16} />} label="Tax Settings" sub="Indian income tax estimate" onClick={() => router.push('/tax-estimate')} />
                    <div style={divider} />
                    <SettingsRow icon={<Bell size={16} />} label="Notifications" sub="Budget alerts and reminders" onClick={() => toast.success('Notifications coming soon')} />
                </div>

                {/* ── SIGN OUT ── */}
                <button
                    type="button"
                    onClick={() => { logout(); router.push('/login'); }}
                    style={{ width: '100%', padding: '14px', background: 'color-mix(in srgb, var(--color-exp) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', borderRadius: 'var(--radius-lg)', color: 'var(--color-exp)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-exp) 14%, var(--bg-card))'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-exp) 8%, var(--bg-card))'; }}
                >
                    Sign Out
                </button>

            </div>
        </AppLayout>
    );
}
