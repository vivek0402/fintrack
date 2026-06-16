'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthPanel } from '@/components/auth/AuthPanel';

export default function LoginPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth } = useAuthStore();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && user) router.push('/dashboard'); }, [user, isLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await authAPI.login(form);
            setAuth(res.data.user, res.data.token);
            const dest = localStorage.getItem(`onboarded-${res.data.user.id}`) ? '/dashboard' : '/onboarding';
            router.push(dest);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthPanel>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                    Welcome back
                </h1>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Sign in to your account
                </p>
            </div>

            <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    icon={<Mail size={15} />}
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    autoComplete="off"
                    required
                />

                <div>
                    <Input
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Your password"
                        icon={<Lock size={15} />}
                        suffix={
                            <button type="button" onClick={() => setShowPassword(v => !v)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}>
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        }
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        autoComplete="new-password"
                        required
                    />
                    <div style={{ textAlign: 'right', marginTop: '8px' }}>
                        <button type="button" onClick={() => router.push('/forgot-password')}
                            style={{ background: 'none', border: 'none', fontSize: '12px', color: 'var(--accent)', fontWeight: 500, cursor: 'pointer', padding: 0 }}>
                            Forgot password?
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-exp)' }}>
                        {error}
                    </div>
                )}

                <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                    Sign In
                </Button>
            </form>

            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                New to FinTrack?{' '}
                <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/register')}>
                    Create account
                </span>
            </div>
        </AuthPanel>
    );
}
