'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthPanel } from '@/components/auth/AuthPanel';

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
    useEffect(() => { return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }; }, []);

    function startCooldown(seconds = 60) {
        setCooldown(seconds);
        cooldownRef.current = setInterval(() => {
            setCooldown(prev => { if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; } return prev - 1; });
        }, 1000);
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        setLoading(true);
        try {
            await authAPI.register(form);
            setPendingEmail(form.email);
            setStep('verify');
            startCooldown(60);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed.');
        } finally { setLoading(false); }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) { setError('Enter the 6-digit code sent to your email.'); return; }
        setLoading(true);
        try {
            const res = await authAPI.verifyEmail({ email: pendingEmail, otp });
            setAuth(res.data.user, res.data.token, res.data.refreshToken);
            router.push('/onboarding');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Verification failed.');
        } finally { setLoading(false); }
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

    const pw = form.password;
    const pwStrength = pw.length === 0 ? 0 : pw.length < 6 ? 1 : pw.length < 8 ? 2 : (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) ? 4 : 3;
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
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
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
        <AuthPanel>
            {/* ── Register step ── */}
            {step === 'register' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                            Create account
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Start your financial journey
                        </p>
                    </div>

                    <form onSubmit={handleRegister} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input label="Full Name" type="text" placeholder="Your full name" icon={<User size={15} />}
                            value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} autoComplete="off" required />

                        <Input label="Email" type="email" placeholder="you@example.com" icon={<Mail size={15} />}
                            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" required />

                        <div>
                            <Input label="Password" type={showPassword ? 'text' : 'password'} placeholder="Min. 6 characters" icon={<Lock size={15} />}
                                suffix={
                                    <button type="button" onClick={() => setShowPassword(v => !v)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}>
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                }
                                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
                            {pw.length > 0 && (
                                <div style={{ marginTop: '8px' }}>
                                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                                        {[1, 2, 3, 4].map(i => (
                                            <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= pwStrength ? strengthColors[pwStrength] : 'var(--border-subtle)', transition: 'background 0.2s' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: '11px', color: strengthColors[pwStrength] }}>{strengthLabels[pwStrength]}</div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-exp)' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Create Account
                        </Button>

                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
                            By signing up you agree to our{' '}
                            <span style={{ color: 'var(--accent)' }}>Terms of Service</span> and{' '}
                            <span style={{ color: 'var(--accent)' }}>Privacy Policy</span>
                        </p>
                    </form>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                        Already have an account?{' '}
                        <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/login')}>Sign in</span>
                    </div>
                </>
            )}

            {/* ── OTP verify step ── */}
            {step === 'verify' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-full)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                            <Mail size={22} color="var(--accent)" />
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                            Check your email
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                            We sent a 6-digit code to{' '}
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pendingEmail}</span>
                        </p>
                    </div>

                    <form onSubmit={handleVerify} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            {otpDigits.map((digit, i) => (
                                <input key={i}
                                    ref={el => { otpRefs.current[i] = el; }}
                                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                    onPaste={handleOtpPaste}
                                    onFocus={() => setFocusedOtp(i)}
                                    onBlur={() => setFocusedOtp(null)}
                                    style={{
                                        width: '48px', height: '56px', textAlign: 'center',
                                        fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                                        background: 'var(--bg-surface-2)',
                                        border: `1.5px solid ${focusedOtp === i || digit ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', outline: 'none',
                                        boxShadow: focusedOtp === i ? '0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                                        transition: 'border-color 0.15s, box-shadow 0.15s',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            ))}
                        </div>

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-exp)' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%' }}>
                            Verify Email
                        </Button>

                        <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                            {cooldown > 0 ? `Resend code in ${cooldown}s` : (
                                <>Didn&apos;t receive it?{' '}
                                    <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={handleResend}>Resend</span>
                                </>
                            )}
                        </div>
                    </form>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                        <button type="button" onClick={() => { setStep('register'); setError(''); setOtp(''); setOtpDigits(Array(6).fill('')); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}>
                            <ArrowLeft size={13} /> Back to registration
                        </button>
                    </div>
                </>
            )}
        </AuthPanel>
    );
}
