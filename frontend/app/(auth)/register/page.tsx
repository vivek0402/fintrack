'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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

    const [showPassword, setShowPassword] = useState(false);
    const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
    const [focusedOtp, setFocusedOtp] = useState<number | null>(null);
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
    const strengthColors = ['', 'var(--color-exp)', 'var(--color-warn)', 'var(--accent)', 'var(--color-inc)'];
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

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <div style={{ width: '100%', maxWidth: '420px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', padding: 'var(--space-8) var(--space-7)' }}>

                {/* Wordmark */}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--space-6)' }}>
                    Fin<span style={{ fontWeight: 500, color: 'var(--accent)' }}>Track</span>
                </div>

                {/* ── Register step ── */}
                {step === 'register' && (
                    <form onSubmit={handleRegister} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <div>
                            <div style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 'var(--space-1)' }}>Create account</div>
                            <div style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)' }}>Start your financial journey</div>
                        </div>

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

                        <div>
                            <Input
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Min. 6 characters"
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
                            {pw.length > 0 && (
                                <div style={{ marginTop: 'var(--space-2)' }}>
                                    <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-1)' }}>
                                        {[1, 2, 3, 4].map(i => (
                                            <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= pwStrength ? strengthColors[pwStrength] : 'var(--border-subtle)' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 'var(--text-caption)', color: strengthColors[pwStrength] }}>{strengthLabels[pwStrength]}</div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-caption)', color: 'var(--color-exp)' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%' }}>
                            Create Account
                        </Button>

                        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                            By signing up you agree to our{' '}
                            <span style={{ color: 'var(--accent)' }}>Terms of Service</span>
                            {' '}and{' '}
                            <span style={{ color: 'var(--accent)' }}>Privacy Policy</span>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                            Already have an account?{' '}
                            <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/login')}>Sign in</span>
                        </div>
                    </form>
                )}

                {/* ── OTP verify step ── */}
                {step === 'verify' && (
                    <form onSubmit={handleVerify} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-full)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            <Mail size={24} color="var(--accent)" />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 'var(--space-1)' }}>Check your email</div>
                            <div style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                We sent a 6-digit code to<br />
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pendingEmail}</span>
                            </div>
                        </div>

                        {/* OTP boxes */}
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
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
                                    onFocus={() => setFocusedOtp(i)}
                                    onBlur={() => setFocusedOtp(null)}
                                    style={{
                                        width: '44px', height: '52px', textAlign: 'center', fontSize: '20px', fontWeight: 700,
                                        background: 'var(--bg-surface-2)',
                                        border: `1px solid ${focusedOtp === i || digit ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', outline: 'none',
                                        fontFamily: 'var(--font-body)',
                                        boxShadow: focusedOtp === i ? 'color-mix(in srgb, var(--accent) 15%, transparent) 0 0 0 3px' : 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            ))}
                        </div>

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-caption)', color: 'var(--color-exp)' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%' }}>
                            Verify Email
                        </Button>

                        <div style={{ textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                            {cooldown > 0 ? (
                                `Resend code in ${cooldown}s`
                            ) : (
                                <>Didn&apos;t receive a code?{' '}
                                    <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={handleResend}>Resend</span>
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => { setStep('register'); setError(''); setOtp(''); setOtpDigits(Array(6).fill('')); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--text-caption)' }}
                            >
                                <ShieldCheck size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                Back
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
