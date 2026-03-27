const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

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
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        console.log('CORS blocked origin:', origin);
        callback(null, true); // temporarily allow all origins to debug
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200,
}));

app.options('/{*path}', cors());
app.use(express.json());

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/recurring', require('./routes/recurring'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/splits', require('./routes/splits'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/accounts', require('./routes/accounts'));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});