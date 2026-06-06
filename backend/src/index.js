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
const { sendToUser } = require('./utils/fcm');
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

// ─── Root + Health check ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/health'));

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
app.use('/api/notifications',    require('./routes/notifications'));

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

// ─── Cron: bill-due reminders — daily at 8am IST ─────────────────────────────
cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Checking bill-due reminders...');
    try {
        const { rows: users } = await pool.query(
            `SELECT DISTINCT user_id FROM user_fcm_tokens`
        );

        for (const { user_id } of users) {
            try {
                const today = new Date().toISOString().split('T')[0];
                const in3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

                const { rows: bills } = await pool.query(
                    `SELECT id, description, next_due_date FROM recurring_transactions
                     WHERE user_id = $1 AND is_active = true
                       AND next_due_date BETWEEN $2 AND $3`,
                    [user_id, today, in3]
                );

                for (const bill of bills) {
                    const alertKey = `bill_due:${bill.id}:${bill.next_due_date}`;
                    try {
                        await pool.query(
                            `INSERT INTO notification_log (user_id, alert_key) VALUES ($1, $2)
                             ON CONFLICT (user_id, alert_key) DO NOTHING`,
                            [user_id, alertKey]
                        );
                        // If already logged (conflict), rowCount is 0 — skip send
                        const { rowCount } = await pool.query(
                            `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                            [user_id, alertKey]
                        );
                        if (rowCount) {
                            const dueDate = new Date(bill.next_due_date);
                            const dayLabel = dueDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                            await sendToUser(user_id, {
                                title: 'Bill Due Soon',
                                body: `${bill.description} is due on ${dayLabel}`,
                                data: { type: 'bill_reminder', id: String(bill.id) },
                            });
                        }
                    } catch { /* per-bill errors are silent */ }
                }
            } catch (err) {
                console.error(`[Cron:Bills] user ${user_id} failed:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:Bills] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: weekly spending summary — Sunday at 9am IST ───────────────────────
cron.schedule('0 9 * * 0', async () => {
    console.log('[Cron] Sending weekly spending summaries...');
    try {
        const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        const { rows: users } = await pool.query(
            `SELECT DISTINCT user_id FROM user_fcm_tokens`
        );

        for (const { user_id } of users) {
            try {
                const alertKey = `weekly_summary:${today}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                const { rows } = await pool.query(
                    `SELECT COALESCE(SUM(amount),0) AS total
                     FROM transactions
                     WHERE user_id=$1 AND type='expense' AND date BETWEEN $2 AND $3`,
                    [user_id, weekStart, today]
                );
                const total = parseFloat(rows[0]?.total || 0);

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );

                await sendToUser(user_id, {
                    title: 'Weekly Spending Summary',
                    body: `You spent ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} this week.`,
                    data: { type: 'weekly_summary' },
                });
            } catch (err) {
                console.error(`[Cron:Weekly] user ${user_id} failed:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:Weekly] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: 8pm daily reminder to log transactions ────────────────────────────
cron.schedule('0 20 * * *', async () => {
    console.log('[Cron] Sending 8pm transaction reminders...');
    try {
        const today = new Date().toISOString().split('T')[0];
        const { rows: users } = await pool.query(
            `SELECT DISTINCT user_id FROM user_fcm_tokens`
        );

        for (const { user_id } of users) {
            try {
                const alertKey = `daily_reminder:${today}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                // Only send if no transactions logged today
                const { rows } = await pool.query(
                    `SELECT 1 FROM transactions WHERE user_id=$1 AND date=$2 LIMIT 1`,
                    [user_id, today]
                );
                if (rows.length) continue;

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );
                await sendToUser(user_id, {
                    title: "Log Today's Expenses",
                    body: "Don't forget to record your transactions for today!",
                    data: { type: 'daily_reminder' },
                });
            } catch (err) {
                console.error(`[Cron:DailyReminder] user ${user_id} failed:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:DailyReminder] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: inactivity reminder — daily at noon ───────────────────────────────
cron.schedule('0 12 * * *', async () => {
    console.log('[Cron] Checking inactivity...');
    try {
        const today = new Date().toISOString().split('T')[0];
        const { rows: users } = await pool.query(
            `SELECT DISTINCT user_id FROM user_fcm_tokens`
        );

        for (const { user_id } of users) {
            try {
                const alertKey = `inactivity:${today}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                const { rows } = await pool.query(
                    `SELECT MAX(date) AS last_date FROM transactions WHERE user_id=$1`,
                    [user_id]
                );
                const lastDate = rows[0]?.last_date;
                if (!lastDate) continue;

                const daysSince = Math.floor(
                    (Date.now() - new Date(lastDate).getTime()) / 86400000
                );
                if (daysSince < 2) continue;

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );
                await sendToUser(user_id, {
                    title: 'Missing Transactions?',
                    body: `You haven't logged any transactions in ${daysSince} days. Stay on top of your finances!`,
                    data: { type: 'inactivity_reminder' },
                });
            } catch (err) {
                console.error(`[Cron:Inactivity] user ${user_id} failed:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:Inactivity] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: month-end budget check — daily 8am, last 5 days of month ──────────
cron.schedule('30 8 * * *', async () => {
    try {
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysLeft = lastDay - now.getDate();
        if (daysLeft > 5) return;

        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM user_fcm_tokens`);

        for (const { user_id } of users) {
            try {
                const { rows: budgets } = await pool.query(
                    `SELECT b.id, b.amount, c.name,
                            COALESCE(SUM(t.amount),0) AS spent
                     FROM budgets b
                     JOIN categories c ON c.id = b.category_id
                     LEFT JOIN transactions t ON t.user_id=b.user_id AND t.category_id=b.category_id
                       AND t.type='expense' AND to_char(t.date,'YYYY-MM')=$2
                     WHERE b.user_id=$1
                     GROUP BY b.id, b.amount, c.name
                     HAVING b.amount - COALESCE(SUM(t.amount),0) > 0`,
                    [user_id, thisMonth]
                );

                for (const b of budgets) {
                    const remaining = parseFloat(b.amount) - parseFloat(b.spent);
                    const alertKey = `month_end_budget:${b.id}:${thisMonth}`;
                    const { rowCount } = await pool.query(
                        `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                        [user_id, alertKey]
                    );
                    if (!rowCount) continue;
                    await sendToUser(user_id, {
                        title: 'Month-End Budget Update 🗓️',
                        body: `You've got ₹${remaining.toLocaleString('en-IN', { maximumFractionDigits: 0 })} left in your ${b.name} budget with ${daysLeft} day${daysLeft !== 1 ? 's' : ''} to go. Spend wisely! 😊`,
                        data: { type: 'month_end_budget' },
                    });
                }
            } catch (err) {
                console.error(`[Cron:MonthEnd] user ${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:MonthEnd] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: mid-month spending vs last month — 15th at 10am ───────────────────
cron.schedule('0 10 15 * *', async () => {
    console.log('[Cron] Sending mid-month spending comparison...');
    try {
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const today = now.toISOString().split('T')[0];
        const lastMonthDate = new Date(now);
        lastMonthDate.setMonth(now.getMonth() - 1);
        const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
        const lastMonthSameDay = lastMonthDate.toISOString().split('T')[0];
        const monthLabel = now.toLocaleDateString('en-IN', { month: 'long' });

        const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM user_fcm_tokens`);

        for (const { user_id } of users) {
            try {
                const alertKey = `midmonth:${today.slice(0, 7)}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                const [{ rows: [thisRow] }, { rows: [lastRow] }, { rows: [incomeRow] }] = await Promise.all([
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND type='expense' AND date BETWEEN $2 AND $3`,
                        [user_id, monthStart, today]
                    ),
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND type='expense' AND date BETWEEN $2 AND $3`,
                        [user_id, lastMonthStart, lastMonthSameDay]
                    ),
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND type='income' AND date BETWEEN $2 AND $3`,
                        [user_id, monthStart, today]
                    ),
                ]);

                const thisSpend = parseFloat(thisRow.total);
                const lastSpend = parseFloat(lastRow.total);
                const income = parseFloat(incomeRow.total);

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );

                const diff = lastSpend > 0 ? Math.round(((thisSpend - lastSpend) / lastSpend) * 100) : 0;
                const direction = diff >= 0 ? `${diff}% more` : `${Math.abs(diff)}% less`;
                const tone = diff > 20 ? '🤔' : diff < -10 ? '🎉' : '😊';
                await sendToUser(user_id, {
                    title: `${monthLabel} Mid-Month Check-in 📊`,
                    body: `You've spent ₹${thisSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })} so far — that's ${direction} than last month at this point. Income logged: ₹${income.toLocaleString('en-IN', { maximumFractionDigits: 0 })}. ${tone}`,
                    data: { type: 'midmonth_summary' },
                });
            } catch (err) {
                console.error(`[Cron:MidMonth] user ${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:MidMonth] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: goal deadline approaching — daily 9am ─────────────────────────────
cron.schedule('0 9 * * *', async () => {
    try {
        const { rows: goals } = await pool.query(
            `SELECT g.*, u.id AS uid
             FROM savings_goals g
             JOIN users u ON u.id = g.user_id
             JOIN user_fcm_tokens ft ON ft.user_id = g.user_id
             WHERE g.deadline IS NOT NULL
               AND g.saved_amount < g.target_amount
               AND g.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
        );

        for (const g of goals) {
            try {
                const daysLeft = Math.ceil((new Date(g.deadline) - new Date()) / 86400000);
                const remaining = parseFloat(g.target_amount) - parseFloat(g.saved_amount);
                const alertKey = `goal_deadline:${g.id}:${g.deadline}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [g.user_id, alertKey]
                );
                if (!rowCount) continue;

                await sendToUser(g.user_id, {
                    title: 'Goal Deadline Coming Up! ⏰',
                    body: `Your "${g.name}" deadline is in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}! You're just ₹${remaining.toLocaleString('en-IN', { maximumFractionDigits: 0 })} away — you've absolutely got this! 💪`,
                    data: { type: 'goal_deadline', goal_id: String(g.id) },
                });
            } catch (err) {
                console.error(`[Cron:GoalDeadline] goal ${g.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:GoalDeadline] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: no goal contributions in 2+ weeks — daily 10am ────────────────────
cron.schedule('0 10 * * *', async () => {
    try {
        const { rows: goals } = await pool.query(
            `SELECT g.*
             FROM savings_goals g
             JOIN user_fcm_tokens ft ON ft.user_id = g.user_id
             WHERE g.saved_amount < g.target_amount
               AND g.updated_at < NOW() - INTERVAL '14 days'`
        );

        for (const g of goals) {
            try {
                const alertKey = `goal_inactive:${g.id}:${new Date().toISOString().slice(0, 7)}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [g.user_id, alertKey]
                );
                if (!rowCount) continue;

                await sendToUser(g.user_id, {
                    title: "Your Goal Misses You! 🌱",
                    body: `Your "${g.name}" goal hasn't had any love in a while. Even a small top-up keeps the momentum going — every rupee counts! 😊`,
                    data: { type: 'goal_inactive', goal_id: String(g.id) },
                });
            } catch (err) {
                console.error(`[Cron:GoalInactive] goal ${g.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:GoalInactive] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: salary not received check — daily 9am, sends only 3rd–8th ─────────
cron.schedule('30 9 * * *', async () => {
    try {
        const now = new Date();
        const dayOfMonth = now.getDate();
        if (dayOfMonth < 3 || dayOfMonth > 8) return;

        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const today = now.toISOString().split('T')[0];
        const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM user_fcm_tokens`);

        for (const { user_id } of users) {
            try {
                const alertKey = `salary_missing:${today.slice(0, 7)}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                // Check if any large income (>₹5000) logged this month
                const { rows } = await pool.query(
                    `SELECT 1 FROM transactions
                     WHERE user_id=$1 AND type='income' AND amount > 5000 AND date BETWEEN $2 AND $3 LIMIT 1`,
                    [user_id, monthStart, today]
                );
                if (rows.length) continue;

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );
                await sendToUser(user_id, {
                    title: "Salary Landed Yet? 👀",
                    body: "We haven't seen any income logged this month. Just checking — all good? Don't forget to log it when it arrives! 😊",
                    data: { type: 'salary_reminder' },
                });
            } catch (err) {
                console.error(`[Cron:Salary] user ${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:Salary] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: upcoming bills total — every Monday at 9am ────────────────────────
cron.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Sending upcoming bills weekly total...');
    try {
        const today = new Date().toISOString().split('T')[0];
        const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
        const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM user_fcm_tokens`);

        for (const { user_id } of users) {
            try {
                const alertKey = `bills_week:${today}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                const { rows } = await pool.query(
                    `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
                     FROM recurring_transactions
                     WHERE user_id=$1 AND is_active=true AND next_due_date BETWEEN $2 AND $3`,
                    [user_id, today, in7]
                );
                const total = parseFloat(rows[0]?.total || 0);
                const cnt = parseInt(rows[0]?.cnt || 0);
                if (cnt === 0) continue;

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );
                await sendToUser(user_id, {
                    title: 'Bills Due This Week 📅',
                    body: `You've got ${cnt} bill${cnt !== 1 ? 's' : ''} totalling ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} due this week. Stay ready! 💪`,
                    data: { type: 'weekly_bills' },
                });
            } catch (err) {
                console.error(`[Cron:WeeklyBills] user ${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:WeeklyBills] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: weekend spending spike — Sunday 8pm ────────────────────────────────
cron.schedule('0 20 * * 0', async () => {
    console.log('[Cron] Checking weekend spending spike...');
    try {
        const now = new Date();
        const sunday = now.toISOString().split('T')[0];
        const saturday = new Date(now - 86400000).toISOString().split('T')[0];
        const monday = new Date(now - 6 * 86400000).toISOString().split('T')[0];
        const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM user_fcm_tokens`);

        for (const { user_id } of users) {
            try {
                const alertKey = `weekend_spike:${sunday}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                const [{ rows: [wknd] }, { rows: [wkday] }] = await Promise.all([
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND type='expense' AND date IN ($2,$3)`,
                        [user_id, saturday, sunday]
                    ),
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0)/5.0 AS daily_avg FROM transactions
                         WHERE user_id=$1 AND type='expense' AND date BETWEEN $2 AND $3`,
                        [user_id, monday, saturday]
                    ),
                ]);

                const weekendTotal = parseFloat(wknd.total);
                const weekdayAvg = parseFloat(wkday.daily_avg);
                if (weekendTotal < 500 || weekdayAvg === 0) continue;
                const pct = Math.round((weekendTotal / (weekdayAvg * 2)) * 100);
                if (pct < 150) continue; // only notify if weekend spend is 50%+ higher than expected

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );
                await sendToUser(user_id, {
                    title: 'Big Weekend? 🛍️',
                    body: `You spent ₹${weekendTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} this weekend — ${pct}% of your typical 2-day spend. No judgment, just keeping you in the loop! 😄`,
                    data: { type: 'weekend_spike' },
                });
            } catch (err) {
                console.error(`[Cron:WeekendSpike] user ${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:WeekendSpike] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// ─── Cron: day-of-week spending pattern — Sunday 7am ─────────────────────────
cron.schedule('0 7 * * 0', async () => {
    console.log('[Cron] Analyzing day-of-week spending patterns...');
    try {
        const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM user_fcm_tokens`);

        for (const { user_id } of users) {
            try {
                const today = new Date().toISOString().split('T')[0];
                const alertKey = `day_pattern:${today.slice(0, 7)}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [user_id, alertKey]
                );
                if (alreadySent) continue;

                const { rows } = await pool.query(
                    `SELECT EXTRACT(DOW FROM date) AS dow,
                            AVG(daily_total) AS avg_spend
                     FROM (
                       SELECT date, SUM(amount) AS daily_total
                       FROM transactions
                       WHERE user_id=$1 AND type='expense'
                         AND date >= CURRENT_DATE - INTERVAL '56 days'
                       GROUP BY date
                     ) daily
                     GROUP BY dow
                     ORDER BY avg_spend DESC`,
                    [user_id]
                );

                if (rows.length < 4) continue; // not enough data
                const topDow = parseInt(rows[0].dow);
                const topAvg = parseFloat(rows[0].avg_spend);
                const overallAvg = rows.reduce((s, r) => s + parseFloat(r.avg_spend), 0) / rows.length;
                if (topAvg < overallAvg * 1.4) continue; // not a significant pattern

                const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [user_id, alertKey]
                );
                await sendToUser(user_id, {
                    title: 'Spending Pattern Spotted 📈',
                    body: `Fun fact: you tend to spend the most on ${days[topDow]}! Something to keep in mind this week — a little awareness goes a long way 😊`,
                    data: { type: 'day_pattern', dow: String(topDow) },
                });
            } catch (err) {
                console.error(`[Cron:DayPattern] user ${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:DayPattern] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });