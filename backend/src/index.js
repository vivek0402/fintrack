const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

// ─── Startup assertions ──────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set. Exiting.');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error('❌ FATAL: DATABASE_URL environment variable is not set. Exiting.');
    process.exit(1);
}

const pool = require('./db/pool');
const app = express();
const PORT = process.env.PORT || 5000;

console.log('=== AI Provider Status ===');
console.log('GROQ_API_KEY:   ', process.env.GROQ_API_KEY   ? '✅' : '❌ MISSING');
console.log('GROQ_API_KEY_2: ', process.env.GROQ_API_KEY_2 ? '✅' : '⚠️  using key 1 as fallback');
console.log('GEMINI_API_KEY: ', process.env.GEMINI_API_KEY  ? '✅' : '❌ MISSING');
console.log('=========================');
console.log('Route distribution:');
console.log('  chat               → Groq Key1 llama-3.3-70b  (100K TPD)');
console.log('  salary-allocation  → Gemini Flash             (no token cap)');
console.log('  personality        → Groq Key1 llama-4-scout  (500K TPD)');
console.log('  report             → Groq Key2 llama-4-scout  (500K TPD)');
console.log('  forecast           → Groq Key1 qwen3-32b      (500K TPD)');
console.log('  salary-intelligence→ Groq Key2 qwen3-32b      (500K TPD)');
console.log('  parse-sms          → Groq Key1 llama-3.1-8b   (500K TPD)');
console.log('  quick-add          → Groq Key2 llama-3.1-8b   (500K TPD)');
console.log('  recurring          → Groq Key1 llama-4-scout  (500K TPD)');
console.log('=========================');

app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'https://fintrack-omega-neon.vercel.app',
    'capacitor://localhost',
    'http://localhost',
    'ionic://localhost',
    'https://localhost',
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow non-browser requests (e.g. mobile apps, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        console.warn('CORS blocked origin:', origin);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200,
}));

app.options('/{*path}', cors());
app.use(express.json());

// ─── Rate limiting ────────────────────────────────────────────────────────────
// General API limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});

// Strict limiter for OTP verification (prevents brute-force of 6-digit codes)
const otpVerifyLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many verification attempts. Please wait 10 minutes.' },
    skipSuccessfulRequests: true,
});

// Auth endpoint limiter (login, register, forgot-password)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth requests. Please try again later.' },
});

app.use('/api', apiLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// ─── Routes ──────────────────────────────────────────────────────────────────
// Auth routes with focused rate limiters
const authRouter = require('./routes/auth');
app.post('/api/auth/login',          authLimiter,      (req, res, next) => authRouter(req, res, next));
app.post('/api/auth/register',       authLimiter,      (req, res, next) => authRouter(req, res, next));
app.post('/api/auth/forgot-password',authLimiter,      (req, res, next) => authRouter(req, res, next));
app.post('/api/auth/verify-email',   otpVerifyLimiter, (req, res, next) => authRouter(req, res, next));
app.post('/api/auth/reset-password', otpVerifyLimiter, (req, res, next) => authRouter(req, res, next));
app.use('/api/auth', authRouter);

app.use('/api/categories',   require('./routes/categories'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/budgets',      require('./routes/budgets'));
app.use('/api/analytics',    require('./routes/analytics'));
app.use('/api/profile',      require('./routes/profile'));
app.use('/api/recurring',    require('./routes/recurring'));
app.use('/api/goals',        require('./routes/goals'));
app.use('/api/ai',           require('./routes/ai'));
app.use('/api/splits',       require('./routes/splits'));
app.use('/api/groups',       require('./routes/groups'));
app.use('/api/accounts',     require('./routes/accounts'));

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    // CORS errors
    if (err.message && err.message.includes('not allowed by CORS')) {
        return res.status(403).json({ error: err.message });
    }
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Server start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ─── Cron: process recurring transactions daily at midnight ──────────────────
// Runs server-side so transactions are generated even if the app isn't opened
cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Processing recurring transactions...');
    try {
        const today = new Date().toISOString().split('T')[0];
        const due = await pool.query(
            `SELECT * FROM recurring_transactions WHERE is_active = true AND next_due_date <= $1`,
            [today]
        );

        let processed = 0;
        for (const r of due.rows) {
            try {
                await pool.query(
                    `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, date)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [r.user_id, r.category_id, r.type, r.amount, r.description, r.notes, r.next_due_date]
                );

                const current = new Date(r.next_due_date);
                let next = new Date(current);
                if (r.frequency === 'daily')        next.setDate(current.getDate() + 1);
                else if (r.frequency === 'weekly')   next.setDate(current.getDate() + 7);
                else if (r.frequency === 'monthly') {
                    next.setMonth(current.getMonth() + 1);
                    if (r.day_of_month) next.setDate(r.day_of_month);
                }

                await pool.query(
                    'UPDATE recurring_transactions SET next_due_date=$1 WHERE id=$2',
                    [next.toISOString().split('T')[0], r.id]
                );
                processed++;
            } catch (err) {
                console.error(`[Cron] Failed to process recurring ${r.id} (${r.description}):`, err.message);
            }
        }

        console.log(`[Cron] Done — processed ${processed}/${due.rows.length} recurring transactions.`);
    } catch (err) {
        console.error('[Cron] Recurring job failed:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });