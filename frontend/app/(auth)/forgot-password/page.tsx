'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ShieldCheck, TrendingUp } from 'lucide-react';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ForgotPasswordPage() {
    const router = useRouter();

    // Step: 'email' | 'otp' | 'done'
    const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
    const [pendingEmail, setPendingEmail] = useState('');

    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Resend cooldown
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const handleRequestOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await authAPI.forgotPassword({ email });
            setPendingEmail(email);
            setStep('otp');
            startCooldown(60);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) {
            setError('Enter the 6-digit code sent to your email.');
            return;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setLoading(true);
        try {
            await authAPI.resetPassword({ email: pendingEmail, otp, new_password: newPassword });
            setStep('done');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Reset failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        try {
            await authAPI.resendOTP({ email: pendingEmail, type: 'reset_password' });
            startCooldown(60);
        } catch (err: any) {
            const wait = err.response?.data?.wait;
            if (wait) startCooldown(wait);
            setError(err.response?.data?.error || 'Failed to resend OTP.');
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <div style={{ width: '100%', maxWidth: '420px' }}>

                {/* Wordmark */}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
                    Fin<span style={{ fontWeight: 500, color: 'var(--accent)' }}>Track</span>
                </div>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
                    <div style={{ width: '56px', height: '56px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
                        {step === 'otp' ? <ShieldCheck size={24} color="var(--accent)" /> : <TrendingUp size={24} color="var(--accent)" />}
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 var(--space-1) 0' }}>
                        {step === 'email' && 'Forgot password'}
                        {step === 'otp' && 'Enter your code'}
                        {step === 'done' && 'Password reset!'}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-body)', margin: 0 }}>
                        {step === 'email' && "Enter your email and we'll send a reset code."}
                        {step === 'otp' && `We sent a 6-digit code to ${pendingEmail}`}
                        {step === 'done' && 'Your password has been updated.'}
                    </p>
                </div>

                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', padding: 'var(--space-7)' }}>

                    {step === 'email' && (
                        <form onSubmit={handleRequestOTP} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <Input
                                label="Email"
                                type="email"
                                placeholder="email"
                                icon={<Mail size={15} />}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoComplete="off"
                                required
                            />

                            {error && (
                                <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-caption)', color: 'var(--color-exp)' }}>
                                    {error}
                                </div>
                            )}

                            <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                                Send Reset Code
                            </Button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form onSubmit={handleReset} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <Input
                                label="6-digit code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                placeholder="000000"
                                icon={<ShieldCheck size={15} />}
                                value={otp}
                                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                autoComplete="one-time-code"
                                required
                            />
                            <Input
                                label="New Password"
                                type="password"
                                placeholder="Min. 6 characters"
                                icon={<Lock size={15} />}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />

                            {error && (
                                <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-caption)', color: 'var(--color-exp)' }}>
                                    {error}
                                </div>
                            )}

                            <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                                Reset Password
                            </Button>

                            <div style={{ textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                                Didn't receive it?{' '}
                                {cooldown > 0 ? (
                                    <span style={{ color: 'var(--text-muted)' }}>Resend in {cooldown}s</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 'var(--text-caption)', fontWeight: 500, padding: 0 }}
                                    >
                                        Resend code
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => { setStep('email'); setError(''); setOtp(''); setNewPassword(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--text-caption)', textDecoration: 'underline', padding: 0 }}
                            >
                                ← Try a different email
                            </button>
                        </form>
                    )}

                    {step === 'done' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', textAlign: 'center' }}>
                            <div style={{ padding: 'var(--space-4)', background: 'var(--color-inc-subtle)', border: '1px solid color-mix(in srgb, var(--color-inc) 25%, transparent)', borderRadius: 'var(--radius-md)', color: 'var(--color-inc)', fontSize: 'var(--text-body)' }}>
                                Your password has been reset successfully.
                            </div>
                            <Button size="lg" style={{ width: '100%' }} onClick={() => router.push('/login')}>
                                Sign In
                            </Button>
                        </div>
                    )}

                    <p style={{ textAlign: 'center', marginTop: 'var(--space-5)', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                        Remember it?{' '}
                        <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
