const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { sendOTPEmail } = require('../utils/email');
require('dotenv').config();

const router = express.Router();

// ─── Default categories seeded per user on registration ─────────────────────

const DEFAULT_CATEGORIES = [
    { name: 'Food & Dining',     icon: '🍽️',  color: '#f59e0b' },
    { name: 'Transportation',    icon: '🚗',  color: '#3b82f6' },
    { name: 'Shopping',          icon: '🛍️',  color: '#ec4899' },
    { name: 'Entertainment',     icon: '🎬',  color: '#a855f7' },
    { name: 'Healthcare',        icon: '🏥',  color: '#10b981' },
    { name: 'Education',         icon: '📚',  color: '#06b6d4' },
    { name: 'Utilities',         icon: '⚡',  color: '#f97316' },
    { name: 'Rent & Housing',    icon: '🏠',  color: '#8b5cf6' },
    { name: 'Salary',            icon: '💰',  color: '#10b981' },
    { name: 'Investments',       icon: '📈',  color: '#059669' },
    { name: 'Personal Care',     icon: '💆',  color: '#f43f5e' },
    { name: 'Family & Kids',     icon: '👨‍👩‍👧',  color: '#fb923c' },
    { name: 'Travel',            icon: '✈️',  color: '#0ea5e9' },
    { name: 'Subscriptions',     icon: '📱',  color: '#6366f1' },
    { name: 'Gifts & Donations', icon: '🎁',  color: '#e879f9' },
    { name: 'Other',             icon: '📦',  color: '#64748b' },
];

async function seedDefaultCategories(userId) {
    const existing = await pool.query(
        'SELECT COUNT(*) FROM categories WHERE user_id = $1', [userId]
    );
    if (parseInt(existing.rows[0].count) === 0) {
        await Promise.all(DEFAULT_CATEGORIES.map(cat =>
            pool.query(
                `INSERT INTO categories (user_id, name, icon, color, is_default)
                 VALUES ($1, $2, $3, $4, true)`,
                [userId, cat.name, cat.icon, cat.color]
            )
        ));
        await pool.query(
            `UPDATE categories SET is_investment_category = true WHERE user_id = $1 AND name = 'Investments'`,
            [userId]
        );
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function createOTP(email, type) {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTPs of this type for this email
    await pool.query(
        'DELETE FROM otp_verifications WHERE email = $1 AND type = $2',
        [email, type]
    );

    await pool.query(
        'INSERT INTO otp_verifications (email, otp, type, expires_at) VALUES ($1, $2, $3, $4)',
        [email, otp, type, expiresAt]
    );

    return otp;
}

async function verifyOTP(email, otp, type) {
    // First, check if too many failed attempts exist (brute-force guard)
    const attemptCheck = await pool.query(
        `SELECT attempts FROM otp_verifications
         WHERE email = $1 AND type = $2 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, type]
    );

    if (attemptCheck.rows.length > 0 && (attemptCheck.rows[0].attempts || 0) >= 5) {
        // Invalidate the OTP — too many failed attempts
        await pool.query(
            'DELETE FROM otp_verifications WHERE email = $1 AND type = $2',
            [email, type]
        );
        return null;
    }

    const result = await pool.query(
        `SELECT * FROM otp_verifications
         WHERE email = $1 AND otp = $2 AND type = $3 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, otp, type]
    );

    if (!result.rows[0]) {
        // Increment attempt counter on wrong OTP
        await pool.query(
            `UPDATE otp_verifications SET attempts = COALESCE(attempts, 0) + 1
             WHERE email = $1 AND type = $2 AND expires_at > NOW()`,
            [email, type]
        ).catch(() => {}); // ignore if column doesn't exist yet
        return null;
    }

    return result.rows[0];
}

// ─── Register (step 1: create unverified user, send OTP) ────────────────────

router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        if (!full_name || !email || !password)
            return res.status(400).json({ error: 'All fields are required.' });

        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const existing = await pool.query(
            'SELECT id, is_verified FROM users WHERE email = $1', [email]
        );

        if (existing.rows.length > 0 && existing.rows[0].is_verified) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        if (existing.rows.length > 0 && !existing.rows[0].is_verified) {
            // Update existing unverified account (re-register)
            await pool.query(
                'UPDATE users SET full_name=$1, password_hash=$2 WHERE email=$3',
                [full_name, password_hash, email]
            );
        } else {
            await pool.query(
                `INSERT INTO users (full_name, email, password_hash, is_verified)
                 VALUES ($1, $2, $3, false)`,
                [full_name, email, password_hash]
            );
        }

        const otp = await createOTP(email, 'register');
        res.status(201).json({ message: 'OTP sent to your email. Please verify to activate your account.', email });
        sendOTPEmail(email, otp, 'register').catch(err => console.error('[Email] register OTP fire-and-forget failed:', err));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── Verify Email OTP ───────────────────────────────────────────────────────

router.post('/verify-email', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp)
            return res.status(400).json({ error: 'Email and OTP are required.' });

        const record = await verifyOTP(email, otp, 'register');
        if (!record)
            return res.status(400).json({ error: 'Invalid or expired OTP.' });

        const result = await pool.query(
            `UPDATE users SET is_verified = true
             WHERE email = $1
             RETURNING id, full_name, email, currency, created_at`,
            [email]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'User not found.' });

        // Clean up used OTP
        await pool.query(
            'DELETE FROM otp_verifications WHERE email = $1 AND type = $2',
            [email, 'register']
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Seed default categories for new users (guard: only if none exist)
        seedDefaultCategories(user.id).catch(err =>
            console.error('[Auth] category seed failed:', err.message)
        );

        res.json({ message: 'Email verified. Account activated.', token, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── Resend OTP (60-second cooldown) ────────────────────────────────────────

router.post('/resend-otp', async (req, res) => {
    try {
        const { email, type } = req.body;

        if (!email || !type)
            return res.status(400).json({ error: 'Email and type are required.' });

        if (!['register', 'reset_password'].includes(type))
            return res.status(400).json({ error: 'Invalid OTP type.' });

        // Check cooldown: was an OTP sent within the last 60 seconds?
        const recent = await pool.query(
            `SELECT created_at FROM otp_verifications
             WHERE email = $1 AND type = $2
             ORDER BY created_at DESC LIMIT 1`,
            [email, type]
        );

        if (recent.rows.length > 0) {
            const secondsAgo = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
            if (secondsAgo < 60) {
                const wait = Math.ceil(60 - secondsAgo);
                return res.status(429).json({ error: `Please wait ${wait} seconds before requesting a new OTP.`, wait });
            }
        }

        // For register: user must exist and be unverified
        if (type === 'register') {
            const userRes = await pool.query('SELECT id, is_verified FROM users WHERE email=$1', [email]);
            if (userRes.rows.length === 0 || userRes.rows[0].is_verified)
                return res.status(404).json({ error: 'No pending registration found for this email.' });
        }

        // For reset_password: user must exist and be verified
        if (type === 'reset_password') {
            const userRes = await pool.query('SELECT id, is_verified FROM users WHERE email=$1', [email]);
            if (userRes.rows.length === 0 || !userRes.rows[0].is_verified)
                return res.status(404).json({ error: 'No account found for this email.' });
        }

        const otp = await createOTP(email, type);
        res.json({ message: 'OTP resent successfully.' });
        sendOTPEmail(email, otp, type).catch(err => console.error('[Email] resend OTP fire-and-forget failed:', err));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── Forgot Password (send OTP) ─────────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email)
            return res.status(400).json({ error: 'Email is required.' });

        const result = await pool.query(
            'SELECT id, is_verified FROM users WHERE email = $1', [email]
        );

        // Always return success to avoid email enumeration
        if (result.rows.length === 0 || !result.rows[0].is_verified) {
            return res.json({ message: 'If an account exists, an OTP has been sent.' });
        }

        const otp = await createOTP(email, 'reset_password');
        res.json({ message: 'If an account exists, an OTP has been sent.', email });
        sendOTPEmail(email, otp, 'reset_password').catch(err => console.error('[Email] forgot-password OTP fire-and-forget failed:', err));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── Reset Password (verify OTP + set new password) ─────────────────────────

router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, new_password } = req.body;

        if (!email || !otp || !new_password)
            return res.status(400).json({ error: 'Email, OTP, and new password are required.' });

        if (new_password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const record = await verifyOTP(email, otp, 'reset_password');
        if (!record)
            return res.status(400).json({ error: 'Invalid or expired OTP.' });

        const password_hash = await bcrypt.hash(new_password, 10);

        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE email = $2',
            [password_hash, email]
        );

        // Clean up used OTP
        await pool.query(
            'DELETE FROM otp_verifications WHERE email = $1 AND type = $2',
            [email, 'reset_password']
        );

        res.json({ message: 'Password reset successfully. You can now sign in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── Login ───────────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required.' });

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1', [email]
        );
        if (result.rows.length === 0)
            return res.status(401).json({ error: 'Invalid email or password.' });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch)
            return res.status(401).json({ error: 'Invalid email or password.' });

        if (!user.is_verified)
            return res.status(403).json({ error: 'Please verify your email before signing in.', unverified: true, email: user.email });

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            message: 'Login successful.',
            token,
            user: {
                id: user.id, full_name: user.full_name,
                email: user.email, currency: user.currency
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── Me ──────────────────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, full_name, email, currency, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'User not found.' });
        res.json({ user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
