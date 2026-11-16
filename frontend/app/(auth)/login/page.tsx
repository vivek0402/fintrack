'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { type } from '@/lib/typography';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { AuthPanel } from '@/components/auth/AuthPanel';

const H1: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 'var(--text-figure)', fontWeight: 700, lineHeight: 1.15, color: 'var(--text-primary)', margin: '0 0 6px' };

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
            setAuth(res.data.user, res.data.token, res.data.refreshToken);
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
                <h1 style={H1}>Welcome back</h1>
                <p style={{ ...type.meta, margin: 0 }}>Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
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
                        style={{ paddingRight: '64px' }}
                        suffix={
                            <TextAction quiet onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? 'Hide' : 'Show'}
                            </TextAction>
                        }
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        autoComplete="new-password"
                        required
                    />
                    <div style={{ textAlign: 'right', marginTop: '8px' }}>
                        <TextAction onClick={() => router.push('/forgot-password')}>Forgot password?</TextAction>
                    </div>
                </div>

                {error && (
                    <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>
                )}

                <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                    Sign in
                </Button>
            </form>

            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={type.body}>New to FinTrack?</span>{' '}
                <TextAction onClick={() => router.push('/register')}>Create account</TextAction>
            </div>
        </AuthPanel>
    );
}
