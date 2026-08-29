'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, ShieldCheck, CheckCircle, ArrowLeft } from 'lucide-react';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthPanel } from '@/components/auth/AuthPanel';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
    const [pendingEmail, setPendingEmail] = useState('');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => { return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }; }, []);

    function startCooldown(seconds = 60) {
        setCooldown(seconds);
        cooldownRef.current = setInterval(() => {
            setCooldown(prev => { if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; } return prev - 1; });
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
        } finally { setLoading(false); }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) { setError('Enter the 6-digit code sent to your email.'); return; }
        if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
        setLoading(true);
        try {
            await authAPI.resetPassword({ email: pendingEmail, otp, new_password: newPassword });
            setStep('done');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Reset failed.');
        } finally { setLoading(false); }
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
        <AuthPanel>
            {/* ── Email step ── */}
            {step === 'email' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-full)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                            <Lock size={22} color="var(--accent)" />
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                            Forgot password?
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Enter your email and we'll send a reset code.
                        </p>
                    </div>

                    <form onSubmit={handleRequestOTP} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input label="Email" type="email" placeholder="you@example.com" icon={<Mail size={15} />}
                            value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" required />

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-exp)' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Send Reset Code
                        </Button>
                    </form>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                        <button type="button" onClick={() => router.push('/login')}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}>
                            <ArrowLeft size={13} /> Back to sign in
                        </button>
                    </div>
                </>
            )}

            {/* ── OTP + new password step ── */}
            {step === 'otp' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-full)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                            <ShieldCheck size={22} color="var(--accent)" />
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                            Enter your code
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                            We sent a 6-digit code to{' '}
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pendingEmail}</span>
                        </p>
                    </div>

                    <form onSubmit={handleReset} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input label="6-digit code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                            placeholder="000000" icon={<ShieldCheck size={15} />}
                            value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            autoComplete="one-time-code" required />

                        <Input label="New Password" type="password" placeholder="Min. 6 characters" icon={<Lock size={15} />}
                            value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />

                        {error && (
                            <div style={{ padding: '10px 14px', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-exp)' }}>
                                {error}
                            </div>
                        )}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Reset Password
                        </Button>

                        <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                            Didn't receive it?{' '}
                            {cooldown > 0 ? <span>Resend in {cooldown}s</span> : (
                                <button type="button" onClick={handleResend}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, padding: 0 }}>
                                    Resend code
                                </button>
                            )}
                        </div>
                    </form>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                        <button type="button" onClick={() => { setStep('email'); setError(''); setOtp(''); setNewPassword(''); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}>
                            <ArrowLeft size={13} /> Try a different email
                        </button>
                    </div>
                </>
            )}

            {/* ── Done step ── */}
            {step === 'done' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                            <CheckCircle size={22} color="var(--color-inc)" />
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                            Password reset!
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Your password has been updated successfully.
                        </p>
                    </div>
                    <Button size="lg" style={{ width: '100%' }} onClick={() => router.push('/login')}>
                        Sign In
                    </Button>
                </>
            )}
        </AuthPanel>
    );
}
