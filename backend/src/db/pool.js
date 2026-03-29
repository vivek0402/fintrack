const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Log once per pool lifecycle, not per connection
let connected = false;
pool.on('connect', () => {
    if (!connected) {
        console.log('✅ Connected to PostgreSQL');
        connected = true;
    }
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL pool error:', err.message);
});

module.exports = pool;