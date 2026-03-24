const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTPEmail(to, otp, type) {
    const isReset = type === 'reset_password';
    const subject = isReset ? 'FinTrack — Reset your password' : 'FinTrack — Verify your email';
    const action = isReset ? 'reset your password' : 'activate your account';

    const { data, error } = await resend.emails.send({
        from: 'FinTrack <onboarding@resend.dev>',
        to,
        subject,
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;color:#e2e8f0;border-radius:12px">
                <h2 style="color:#10b981;margin:0 0 8px">FinTrack</h2>
                <p style="margin:0 0 24px;color:#94a3b8">Use the code below to ${action}. It expires in <strong>10 minutes</strong>.</p>
                <div style="text-align:center;background:#1e2433;border-radius:10px;padding:24px;margin-bottom:24px">
                    <span style="font-size:2.5rem;font-weight:700;letter-spacing:0.3em;color:#ffffff">${otp}</span>
                </div>
                <p style="font-size:0.8rem;color:#64748b;margin:0">If you did not request this, you can safely ignore this email.</p>
            </div>
        `,
    });

    if (error) {
        console.error('[Email] Resend error for', to, ':', error);
        throw new Error(error.message);
    }

    console.log('[Email] Sent', type, 'OTP to', to, '— id:', data.id);
}

module.exports = { sendOTPEmail };
