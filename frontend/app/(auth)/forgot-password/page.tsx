'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { type } from '@/lib/typography';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { AuthPanel } from '@/components/auth/AuthPanel';

const H1: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 'var(--text-figure)', fontWeight: 700, lineHeight: 1.15, color: 'var(--text-primary)', margin: '0 0 6px' };

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
    const [pendingEmail, setPendingEmail] = useState('');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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

    const errorLine = error && (
        <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>
    );

    return (
        <AuthPanel>
            {/* Email step */}
            {step === 'email' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={H1}>Reset your password</h1>
                        <p style={{ ...type.meta, margin: 0 }}>Enter your email and we&apos;ll send a reset code.</p>
                    </div>

                    <form onSubmit={handleRequestOTP} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input label="Email" type="email" placeholder="you@example.com"
                            value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" required />

                        {errorLine}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Send reset code
                        </Button>
                    </form>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                        <TextAction onClick={() => router.push('/login')}>Back to sign in</TextAction>
                    </div>
                </>
            )}

            {/* Code and new password step */}
            {step === 'otp' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={H1}>Enter your code</h1>
                        <p style={{ ...type.meta, margin: 0 }}>
                            We sent a 6-digit code to{' '}
                            <span style={{ color: 'var(--text-primary)' }}>{pendingEmail}</span>
                        </p>
                    </div>

                    <form onSubmit={handleReset} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input label="6-digit code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                            placeholder="000000"
                            value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            autoComplete="one-time-code" required />

                        <Input label="New password" type={showPassword ? 'text' : 'password'} placeholder="At least 6 characters"
                            style={{ paddingRight: '64px' }}
                            suffix={
                                <TextAction quiet onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                    {showPassword ? 'Hide' : 'Show'}
                                </TextAction>
                            }
                            value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />

                        {errorLine}

                        <Button type="submit" size="lg" isLoading={loading} style={{ width: '100%', marginTop: '4px' }}>
                            Reset password
                        </Button>

                        <div style={{ ...type.meta, textAlign: 'center' }}>
                            {cooldown > 0 ? <span>Resend in {cooldown}s</span> : (
                                <TextAction quiet onClick={handleResend}>Resend code</TextAction>
                            )}
                            {' · '}
                            <TextAction quiet onClick={() => { setStep('email'); setError(''); setOtp(''); setNewPassword(''); }}>
                                Use a different email
                            </TextAction>
                        </div>
                    </form>
                </>
            )}

            {/* Done step */}
            {step === 'done' && (
                <>
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={H1}>Password updated</h1>
                        <p style={{ ...type.meta, margin: 0 }}>Your password has been updated successfully.</p>
                    </div>
                    <Button size="lg" style={{ width: '100%' }} onClick={() => router.push('/login')}>
                        Sign in
                    </Button>
                </>
            )}
        </AuthPanel>
    );
}
