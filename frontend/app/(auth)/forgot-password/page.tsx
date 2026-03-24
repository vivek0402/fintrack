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
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ width: '56px', height: '56px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        {step === 'otp' ? <ShieldCheck size={24} color="#10b981" /> : <TrendingUp size={24} color="#10b981" />}
                    </div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                        {step === 'email' && 'Forgot password'}
                        {step === 'otp' && 'Enter your code'}
                        {step === 'done' && 'Password reset!'}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                        {step === 'email' && "Enter your email and we'll send a reset code."}
                        {step === 'otp' && `We sent a 6-digit code to ${pendingEmail}`}
                        {step === 'done' && 'Your password has been updated.'}
                    </p>
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '28px' }}>

                    {step === 'email' && (
                        <form onSubmit={handleRequestOTP} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <Input
                                label="Email"
                                type="email"
                                placeholder="you@example.com"
                                icon={<Mail size={15} />}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoComplete="off"
                                required
                            />

                            {error && (
                                <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', fontSize: '0.8rem', color: '#f87171' }}>
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
                                <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', fontSize: '0.8rem', color: '#f87171' }}>
                                    {error}
                                </div>
                            )}

                            <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                                Reset Password
                            </Button>

                            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Didn't receive it?{' '}
                                {cooldown > 0 ? (
                                    <span style={{ color: 'var(--text-secondary)' }}>Resend in {cooldown}s</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, padding: 0 }}
                                    >
                                        Resend code
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => { setStep('email'); setError(''); setOtp(''); setNewPassword(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', padding: 0 }}
                            >
                                ← Try a different email
                            </button>
                        </form>
                    )}

                    {step === 'done' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
                            <div style={{ padding: '16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', color: '#10b981', fontSize: '0.875rem' }}>
                                Your password has been reset successfully.
                            </div>
                            <Button size="lg" style={{ width: '100%' }} onClick={() => router.push('/login')}>
                                Sign In
                            </Button>
                        </div>
                    )}

                    <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Remember it?{' '}
                        <Link href="/login" style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
