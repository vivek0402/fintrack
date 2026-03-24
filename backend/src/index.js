const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const pool = require('./db/pool');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : 'http://localhost:3000',
    credentials: true,
}));
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

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});