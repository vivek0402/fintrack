'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth } = useAuthStore();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // UI-only state
    const [focusedField, setFocusedField] = useState<string | null>(null);
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

    const inputStyle = (field: string): React.CSSProperties => ({
        width: '100%',
        background: 'var(--surface-1)',
        border: focusedField === field ? '1px solid #3b82f6' : '1px solid #1e2d4a',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 14,
        color: 'var(--text-primary)',
        outline: 'none',
        boxSizing: 'border-box',
        boxShadow: focusedField === field ? '0 0 0 2px rgba(59,130,246,0.12)' : 'none',
    });

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060b18 0%,#0a0f1e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'DM Sans, sans-serif', position: 'relative', overflow: 'hidden' }}>
            {/* Ambient glows */}
            <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 250, height: 250, background: 'radial-gradient(circle,rgba(59,130,246,0.11),transparent 65%)', borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -50, left: -30, width: 180, height: 180, background: 'radial-gradient(circle,rgba(16,185,129,0.08),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, background: 'rgba(12,18,36,0.95)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '32px 28px' }}>

                {/* Brand wordmark */}
                <div style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 24 }}>
                    Fin<span style={{ color: 'var(--accent-blue)' }}>Track</span>
                </div>

                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", marginBottom: 4 }}>Welcome back</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Sign in to your account</div>

                <form onSubmit={handleSubmit} autoComplete="off">
                    {/* Email */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>EMAIL</div>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            onFocus={() => setFocusedField('email')}
                            onBlur={() => setFocusedField(null)}
                            autoComplete="off"
                            required
                            placeholder="email"
                            style={inputStyle('email')}
                        />
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>PASSWORD</div>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                onFocus={() => setFocusedField('password')}
                                onBlur={() => setFocusedField(null)}
                                autoComplete="new-password"
                                required
                                placeholder="Your password"
                                style={{ ...inputStyle('password'), paddingRight: 40 }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Forgot password */}
                    <div style={{ textAlign: 'right', marginBottom: 20, marginTop: -4 }}>
                        <button
                            type="button"
                            onClick={() => router.push('/forgot-password')}
                            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--accent-blue)', fontWeight: 500, cursor: 'pointer', padding: 0 }}
                        >
                            Forgot password?
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent-red)' }}>{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, width: '100%', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                        {loading
                            ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                            : 'Sign In'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
                    New to FinTrack?{' '}
                    <span style={{ color: 'var(--accent-blue)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/register')}>Create account</span>
                </div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
