const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
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

// ─── Run pending migrations on startup ───────────────────────────────────────
async function runMigrations() {
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
            await pool.query(sql);
            console.log(`✅ Migration applied: ${file}`);
        } catch (err) {
            console.error(`❌ Migration failed: ${file} — ${err.message}`);
        }
    }
}
runMigrations().catch(err => console.error('[Migrations] Fatal:', err.message));
app.set('trust proxy', 1);
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

app.use(helmet({
    contentSecurityPolicy: false,       // API server — no HTML pages
    crossOriginEmbedderPolicy: false,   // Required for Vercel/Capacitor clients
}));

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
// Body size limits — 10mb to support base64 receipt images
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// AI endpoint limiter — 30 req/hour per user (uses JWT id as key when available)
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Try to use authenticated user id; fall back to IP
        const auth = req.headers['authorization'];
        if (auth && auth.startsWith('Bearer ')) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
                return `ai:user:${decoded.id}`;
            } catch { /* fall through to IP */ }
        }
        return ipKeyGenerator(req);
    },
    message: { error: 'AI request limit reached. Please wait before making more AI requests.' },
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
app.use('/api/ai',           aiLimiter, require('./routes/ai'));
app.use('/api/splits',       require('./routes/splits'));
app.use('/api/groups',       require('./routes/groups'));
app.use('/api/accounts',          require('./routes/accounts'));
app.use('/api/one-time-expenses', require('./routes/oneTimeExpenses'));
app.use('/api/credit-cards',      require('./routes/creditCards'));
app.use('/api/wallets',           require('./routes/wallets'));

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    // CORS errors — safe to surface the origin name
    if (err.message && err.message.includes('not allowed by CORS')) {
        return res.status(403).json({ error: 'CORS: origin not allowed' });
    }
    console.error('[GlobalError]', err.stack || err.message);
    // Never expose internal error details to clients
    res.status(err.status || 500).json({ error: 'Internal server error' });
});

// ─── Server start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ─── Cron: keep Supabase DB alive (free tier pauses after 1 week idle) ───────
// Runs every 9 minutes — lightweight SELECT 1, no user data touched.
// Note: this only runs while the server is awake. To keep the SERVER awake on
// Render/Railway free tier, register https://<your-backend>/health on UptimeRobot
// (free) with a 5-minute check interval.
cron.schedule('*/9 * * * *', async () => {
    try {
        await pool.query('SELECT 1');
    } catch (err) {
        console.error('[KeepAlive] DB ping failed:', err.message);
    }
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