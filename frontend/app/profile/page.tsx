'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Lock, Globe, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { profileAPI } from '@/lib/api';
import { BankAccountsSection } from '@/components/profile/BankAccountsSection';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import PageHelp from '@/components/ui/PageHelp';
import { toast } from '@/store/toastStore';

const CURRENCIES = [
    { code: 'INR', label: 'Indian Rupee (₹)' },
    { code: 'USD', label: 'US Dollar ($)' },
    { code: 'EUR', label: 'Euro (€)' },
    { code: 'GBP', label: 'British Pound (£)' },
    { code: 'AED', label: 'UAE Dirham' },
    { code: 'SGD', label: 'Singapore Dollar' },
];

export default function ProfilePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token } = useAuthStore();
    const isMobile = useIsMobile();

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [profileForm, setProfileForm] = useState({ full_name: '', email: '', currency: 'INR' });
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [passLoading, setPassLoading] = useState(false);
    const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);


    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        profileAPI.get().then(res => {
            setProfile(res.data.profile);
            setProfileForm({ full_name: res.data.profile.full_name, email: res.data.profile.email, currency: res.data.profile.currency });
        }).catch(console.error).finally(() => setLoading(false));
    }, [user]);

    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault(); setProfileMsg(null); setProfileLoading(true);
        try {
            const res = await profileAPI.update(profileForm);
            if (token) setAuth(res.data.user, token);
            toast.success('Profile updated');
            setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to update.';
            toast.error(msg);
            setProfileMsg({ type: 'error', text: msg });
        }
        finally { setProfileLoading(false); }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault(); setPassMsg(null);
        if (passForm.new_password !== passForm.confirm_password) {
            toast.error('Passwords do not match');
            setPassMsg({ type: 'error', text: 'Passwords do not match.' });
            return;
        }
        setPassLoading(true);
        try {
            await profileAPI.changePassword({ current_password: passForm.current_password, new_password: passForm.new_password });
            setPassForm({ current_password: '', new_password: '', confirm_password: '' });
            toast.success('Password changed');
            setPassMsg({ type: 'success', text: 'Password changed successfully.' });
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to change password.';
            toast.error(msg);
            setPassMsg({ type: 'error', text: msg });
        }
        finally { setPassLoading(false); }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} />
        </AppLayout>
    );

    const Msg = ({ msg }: { msg: { type: string; text: string } }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: msg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${msg.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, fontSize: '0.8rem', color: msg.type === 'success' ? '#10b981' : '#f87171' }}>
            {msg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {msg.text}
        </div>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Settings</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Manage your account and preferences</p>
                </div>
                <PageHelp title="Settings" sections={[
                    { icon: '👤', heading: 'What is this page?', body: 'Manage your account details, preferences, and app settings.' },
                    { icon: '🎨', heading: 'Themes', body: 'Switch between Dark (AMOLED black) and Light themes. Dark mode is optimised for OLED screens and saves battery.' },
                    { icon: '💱', heading: 'Currency', body: 'Set your preferred currency. All amounts across the app will display in your chosen currency format.' },
                    { icon: '🔒', heading: 'Security', body: 'Change your password or update your name and email here.' },
                ]} />
            </div>

            <BankAccountsSection />

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', alignItems: 'start', marginTop: '24px' }}>

                {/* Left */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {profile && (
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{profile.full_name?.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                    <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{profile.full_name}</h2>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>{profile.email}</p>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
                                {[
                                    { label: 'Transactions', value: profile.total_transactions, color: '#10b981' },
                                    { label: 'Budgets', value: profile.total_budgets, color: '#3b82f6' },
                                    { label: 'Member Since', value: new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), color: '#f59e0b' },
                                ].map(s => (
                                    <div key={s.label} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px' }}>
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>Personal Information</h3>
                        <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <Input label="Full Name" type="text" placeholder="Your full name" icon={<User size={15} />} value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} required />
                            <Input label="Email Address" type="email" placeholder="your@email.com" icon={<Mail size={15} />} value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} required />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Currency</label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><Globe size={15} /></div>
                                    <select value={profileForm.currency} onChange={e => setProfileForm({ ...profileForm, currency: e.target.value })}
                                        style={{ width: '100%', padding: '10px 16px 10px 38px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            {profileMsg && <Msg msg={profileMsg} />}
                            <Button type="submit" isLoading={profileLoading} size="md">Save Changes</Button>
                        </form>
                    </div>
                </div>

                {/* Right */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px' }}>
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Change Password</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>Choose a strong password with at least 6 characters.</p>
                        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <Input label="Current Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.current_password} onChange={e => setPassForm({ ...passForm, current_password: e.target.value })} required />
                            <Input label="New Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.new_password} onChange={e => setPassForm({ ...passForm, new_password: e.target.value })} required />
                            <Input label="Confirm New Password" type="password" placeholder="••••••••" icon={<Lock size={15} />} value={passForm.confirm_password} onChange={e => setPassForm({ ...passForm, confirm_password: e.target.value })} required />
                            {passForm.new_password && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Password strength</span>
                                        <span style={{ fontSize: '0.72rem', color: passForm.new_password.length < 6 ? '#f43f5e' : passForm.new_password.length < 10 ? '#f59e0b' : '#10b981' }}>
                                            {passForm.new_password.length < 6 ? 'Too short' : passForm.new_password.length < 10 ? 'Good' : 'Strong'}
                                        </span>
                                    </div>
                                    <div style={{ height: '4px', background: 'var(--bg-border)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: passForm.new_password.length < 6 ? '25%' : passForm.new_password.length < 10 ? '60%' : '100%', background: passForm.new_password.length < 6 ? '#f43f5e' : passForm.new_password.length < 10 ? '#f59e0b' : '#10b981', borderRadius: '2px', transition: 'all 0.3s ease' }} />
                                    </div>
                                </div>
                            )}
                            {passMsg && <Msg msg={passMsg} />}
                            <Button type="submit" variant="secondary" isLoading={passLoading} size="md">Update Password</Button>
                        </form>

                        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--bg-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <h4 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>Appearance</h4>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Choose your preferred colour theme</p>
                                </div>
                                <ThemeToggle />
                            </div>
                        </div>

                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--bg-border)' }}>
                            <h4 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: '#f43f5e', margin: '0 0 8px 0' }}>Session</h4>
                            <Button variant="danger" size="sm" onClick={() => { useAuthStore.getState().logout(); router.push('/login'); }}>Sign Out</Button>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}