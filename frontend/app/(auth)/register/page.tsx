'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/lib/api';
import { type } from '@/lib/typography';
import { passwordStrength } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { AuthPanel } from '@/components/auth/AuthPanel';

const H1: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 'var(--text-figure)', fontWeight: 700, lineHeight: 1.15, color: 'var(--text-primary)', margin: '0 0 6px' };

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
    const strength = passwordStrength(pw);
    const strengthColor = [undefined, TONE_TEXT.bad, TONE_TEXT.caution, TONE_TEXT.info, TONE_TEXT.good][strength.level];

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
            {/* Register step */}
            {step === 'register' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={H1}>Create your account</h1>
                        <p style={{ ...type.meta, margin: 0 }}>It takes a minute, and your data stays yours.</p>
                    </div>

                    <form onSubmit={handleRegister} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input label="Full name" type="text" placeholder="Your full name"
                            value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} autoComplete="off" required />

                        <Input label="Email" type="email" placeholder="you@example.com"
                            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" required />

                        <div>
                            <Input label="Password" type={showPassword ? 'text' : 'password'} placeholder="At least 6 characters"
                                style={{ paddingRight: '64px' }}
                                suffix={
                                    <TextAction quiet onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        {showPassword ? 'Hide' : 'Show'}
                                    </TextAction>
                                }
                                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
                            {pw.length > 0 && (
                                <p style={{ ...type.meta, margin: '8px 0 0' }}>
                                    Password strength: <span style={{ color: strengthColor }}>{strength.label}</span>
                                </p>
                            )}
                        </div>

                        {error && (
                            <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Create account
                        </Button>

                        <p style={{ ...type.meta, textAlign: 'center', margin: 0 }}>
                            By signing up you agree to our{' '}
                            <span style={{ color: 'var(--accent-text)' }}>Terms of Service</span> and{' '}
                            <span style={{ color: 'var(--accent-text)' }}>Privacy Policy</span>
                        </p>
                    </form>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                        <span style={type.body}>Already have an account?</span>{' '}
                        <TextAction onClick={() => router.push('/login')}>Sign in</TextAction>
                    </div>
                </>
            )}

            {/* OTP verify step */}
            {step === 'verify' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={H1}>Check your email</h1>
                        <p style={{ ...type.meta, margin: 0 }}>
                            We sent a 6-digit code to{' '}
                            <span style={{ color: 'var(--text-primary)' }}>{pendingEmail}</span>
                        </p>
                    </div>

                    <form onSubmit={handleVerify} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            {otpDigits.map((digit, i) => (
                                <input key={i}
                                    ref={el => { otpRefs.current[i] = el; }}
                                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
                                    aria-label={`Digit ${i + 1}`}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                    onPaste={handleOtpPaste}
                                    onFocus={() => setFocusedOtp(i)}
                                    onBlur={() => setFocusedOtp(null)}
                                    style={{
                                        ...type.stat,
                                        flex: 1, minWidth: 0, height: '52px', textAlign: 'center',
                                        background: 'var(--glass-fill-1)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: 'var(--radius-md)',
                                        outline: focusedOtp === i ? '2px solid var(--accent-text)' : 'none',
                                        outlineOffset: '1px',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            ))}
                        </div>

                        {error && (
                            <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%' }}>
                            Verify and continue
                        </Button>

                        <div style={{ ...type.meta, textAlign: 'center' }}>
                            {cooldown > 0 ? <span>Resend code in {cooldown}s</span> : (
                                <TextAction quiet onClick={handleResend}>Resend code</TextAction>
                            )}
                            {' · '}
                            <TextAction quiet onClick={() => { setStep('register'); setError(''); setOtp(''); setOtpDigits(Array(6).fill('')); }}>
                                Use a different email
                            </TextAction>
                        </div>
                    </form>
                </>
            )}
        </AuthPanel>
    );
}
