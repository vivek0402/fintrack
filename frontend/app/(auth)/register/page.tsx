'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';

export default function RegisterPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth } = useAuthStore();

    const [step, setStep] = useState<'register' | 'verify'>('register');
    const [pendingEmail, setPendingEmail] = useState('');
    const [form, setForm] = useState({ full_name: '', email: '', password: '' });
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // UI-only state
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
    const otpRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && user) router.push('/onboarding'); }, [user, isLoading]);
    useEffect(() => {
        return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
    }, []);

    function startCooldown(seconds = 60) {
        setCooldown(seconds);
        cooldownRef.current = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
                return prev - 1;
            });
        }, 1000);
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (form.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setLoading(true);
        try {
            await authAPI.register(form);
            setPendingEmail(form.email);
            setStep('verify');
            startCooldown(60);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) {
            setError('Enter the 6-digit code sent to your email.');
            return;
        }
        setLoading(true);
        try {
            const res = await authAPI.verifyEmail({ email: pendingEmail, otp });
            setAuth(res.data.user, res.data.token);
            router.push('/onboarding');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        try {
            await authAPI.resendOTP({ email: pendingEmail, type: 'register' });
            startCooldown(60);
        } catch (err: any) {
            const wait = err.response?.data?.wait;
            if (wait) startCooldown(wait);
            setError(err.response?.data?.error || 'Failed to resend OTP.');
        }
    };

    // Password strength
    const pw = form.password;
    const pwStrength = pw.length === 0 ? 0
        : pw.length < 6 ? 1
            : pw.length < 8 ? 2
                : (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) ? 4
                    : 3;
    const strengthColors = ['', '#f43f5e', '#f59e0b', '#3b82f6', '#10b981'];
    const strengthLabels = ['', 'Too short', 'Fair', 'Good', 'Strong'];

    const handleOtpChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        const newDigits = [...otpDigits];
        newDigits[index] = digit;
        setOtpDigits(newDigits);
        setOtp(newDigits.join(''));
        if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newDigits = Array(6).fill('');
        pasted.split('').forEach((d, i) => { newDigits[i] = d; });
        setOtpDigits(newDigits);
        setOtp(newDigits.join(''));
        otpRefs.current[Math.min(pasted.length, 5)]?.focus();
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

    const btnStyle: React.CSSProperties = {
        background: 'var(--accent-blue)',
        color: 'white',
        border: 'none',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        fontWeight: 600,
        width: '100%',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    };

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

                {/* ── Register step ── */}
                {step === 'register' && (
                    <form onSubmit={handleRegister} autoComplete="off">
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", marginBottom: 4 }}>Create account</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Start your financial journey</div>

                        {/* Full Name */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>FULL NAME</div>
                            <input
                                type="text"
                                value={form.full_name}
                                onChange={e => setForm({ ...form, full_name: e.target.value })}
                                onFocus={() => setFocusedField('name')}
                                onBlur={() => setFocusedField(null)}
                                autoComplete="off"
                                required
                                placeholder="Your full name"
                                style={inputStyle('name')}
                            />
                        </div>

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
                                    placeholder="Min. 6 characters"
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
                            {pw.length > 0 && (
                                <>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 6, marginBottom: 4 }}>
                                        {[1, 2, 3, 4].map(i => (
                                            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= pwStrength ? strengthColors[pwStrength] : '#1e2d4a' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 10, color: strengthColors[pwStrength] }}>{strengthLabels[pwStrength]}</div>
                                </>
                            )}
                        </div>

                        {error && (
                            <div style={{ marginTop: 12, marginBottom: 4, padding: '10px 12px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent-red)' }}>{error}</div>
                        )}

                        <button type="submit" disabled={loading} style={{ ...btnStyle, marginTop: 20 }}>
                            {loading
                                ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                                : 'Create Account'}
                        </button>

                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
                            By signing up you agree to our{' '}
                            <span style={{ color: 'var(--accent-blue)' }}>Terms of Service</span>
                            {' '}and{' '}
                            <span style={{ color: 'var(--accent-blue)' }}>Privacy Policy</span>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                            Already have an account?{' '}
                            <span style={{ color: 'var(--accent-blue)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/login')}>Sign in</span>
                        </div>
                    </form>
                )}

                {/* ── OTP verify step ── */}
                {step === 'verify' && (
                    <form onSubmit={handleVerify} autoComplete="off">
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Mail size={24} color="#3b82f6" />
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", textAlign: 'center', marginBottom: 6 }}>Check your email</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8, lineHeight: 1.6 }}>
                            We sent a 6-digit code to<br />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pendingEmail}</span>
                        </div>

                        {/* OTP boxes */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, marginBottom: 20 }}>
                            {otpDigits.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => { otpRefs.current[i] = el; }}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={1}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                    onPaste={handleOtpPaste}
                                    onFocus={() => setFocusedField(`otp-${i}`)}
                                    onBlur={() => setFocusedField(null)}
                                    style={{
                                        width: 44, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
                                        background: 'var(--surface-1)',
                                        border: focusedField === `otp-${i}` ? '1px solid #3b82f6' : digit ? '1px solid rgba(59,130,246,0.4)' : '1px solid #1e2d4a',
                                        borderRadius: 10, color: 'var(--text-primary)', outline: 'none',
                                        boxShadow: focusedField === `otp-${i}` ? '0 0 0 2px rgba(59,130,246,0.15)' : 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            ))}
                        </div>

                        {error && (
                            <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent-red)' }}>{error}</div>
                        )}

                        <button type="submit" disabled={loading} style={btnStyle}>
                            {loading
                                ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                                : 'Verify Email'}
                        </button>

                        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                            {cooldown > 0 ? (
                                `Resend code in ${cooldown}s`
                            ) : (
                                <>Didn&apos;t receive a code?{' '}
                                    <span style={{ color: 'var(--accent-blue)', fontWeight: 600, cursor: 'pointer' }} onClick={handleResend}>Resend</span>
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 12 }}>
                            <button
                                type="button"
                                onClick={() => { setStep('register'); setError(''); setOtp(''); setOtpDigits(Array(6).fill('')); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                            >
                                ← Back to login
                            </button>
                        </div>
                    </form>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
