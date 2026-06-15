'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <div style={{ width: '100%', maxWidth: '420px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', padding: 'var(--space-8) var(--space-7)' }}>

                {/* Wordmark */}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--space-6)' }}>
                    Fin<span style={{ fontWeight: 500, color: 'var(--accent)' }}>Track</span>
                </div>

                <div style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 'var(--space-1)' }}>Welcome back</div>
                <div style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>Sign in to your account</div>

                <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}
                                >
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            }
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            autoComplete="new-password"
                            required
                        />
                        <div style={{ textAlign: 'right', marginTop: 'var(--space-2)' }}>
                            <button
                                type="button"
                                onClick={() => router.push('/forgot-password')}
                                style={{ background: 'none', border: 'none', fontSize: 'var(--text-caption)', color: 'var(--accent)', fontWeight: 500, cursor: 'pointer', padding: 0 }}
                            >
                                Forgot password?
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-caption)', color: 'var(--color-exp)' }}>
                            {error}
                        </div>
                    )}

                    <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%' }}>
                        Sign In
                    </Button>
                </form>

                <div style={{ textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--text-muted)', marginTop: 'var(--space-5)' }}>
                    New to FinTrack?{' '}
                    <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/register')}>Create account</span>
                </div>
            </div>
        </div>
    );
}
