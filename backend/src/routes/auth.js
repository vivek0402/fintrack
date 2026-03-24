const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        if (!full_name || !email || !password)
            return res.status(400).json({ error: 'All fields are required.' });

        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1', [email]
        );
        if (existing.rows.length > 0)
            return res.status(409).json({ error: 'Email already registered.' });

        const password_hash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, currency, created_at`,
            [full_name, email, password_hash]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(201).json({ message: 'Account created.', token, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

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

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
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