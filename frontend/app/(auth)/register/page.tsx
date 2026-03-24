'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, User, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function RegisterPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth } = useAuthStore();
    const [form, setForm] = useState({ full_name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && user) router.push('/onboarding'); }, [user, isLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (form.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setLoading(true);
        try {
            const res = await authAPI.register(form);
            setAuth(res.data.user, res.data.token);
            router.push('/onboarding');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>

                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ width: '56px', height: '56px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <TrendingUp size={24} color="#10b981" />
                    </div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                        Create account
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                        Start tracking your finances today
                    </p>
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '28px' }}>
                    <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input
                            label="Full Name"
                            type="text"
                            placeholder="Your full name"
                            icon={<User size={15} />}
                            value={form.full_name}
                            onChange={e => setForm({ ...form, full_name: e.target.value })}
                            autoComplete="off"
                            required
                        />
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
                        <Input
                            label="Password"
                            type="password"
                            placeholder="Min. 6 characters"
                            icon={<Lock size={15} />}
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            autoComplete="new-password"
                            required
                        />

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', fontSize: '0.8rem', color: '#f87171' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Create Account
                        </Button>
                    </form>

                    <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Already have an account?{' '}
                        <Link href="/login" style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}