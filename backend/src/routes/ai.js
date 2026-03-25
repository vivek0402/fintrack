const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getVisionModel, getGroqClient } = require('../utils/gemini');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── FEATURE 4: Parse SMS ───────────────────────────────────────────
router.post('/parse-sms', authMiddleware, async (req, res) => {
    try {
        const { sms } = req.body;
        if (!sms) return res.status(400).json({ error: 'SMS text is required' });

        const today = new Date().toISOString().split('T')[0];
        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `You are a financial transaction parser for an Indian personal finance app.
Extract transaction details from the following text.

Rules:
- amount: extract the numeric amount (no currency symbol)
- type: 'expense' unless the text clearly mentions salary/received/credited
- category: pick the BEST match from this list only:
  Food & Dining, Transportation, Shopping, Entertainment, Healthcare,
  Education, Utilities, Rent, Salary, Investments, Personal Care, Other
- description: short 2-4 word title (e.g. 'Coffee at Cafe', 'Uber Ride')
- date: today's date in YYYY-MM-DD format if not mentioned (today is ${today})
- notes: payment mode if mentioned (UPI, cash, card), else empty string

Text to parse: "${sms}"

Respond with ONLY a raw JSON object. No markdown. No backticks. No explanation.
Format: {
  "type": "expense",
  "amount": 200,
  "description": "Coffee at Cafe",
  "category": "Food & Dining",
  "date": "${today}",
  "notes": "UPI"
}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const clean = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        res.json({ parsed });
    } catch (err) {
        console.error('AI parse-sms error:', err.message);
        res.status(500).json({ error: 'Failed to parse transaction' });
    }
});

// ─── FEATURE 1: Monthly Report ──────────────────────────────────────
router.post('/report', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const { rows: transactions } = await pool.query(
            `SELECT t.*, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND EXTRACT(MONTH FROM t.date) = $2 AND EXTRACT(YEAR FROM t.date) = $3
             ORDER BY t.date DESC`,
            [userId, month, year]
        );

        const { rows: budgets } = await pool.query(
            `SELECT b.*, c.name as category_name
             FROM budgets b
             LEFT JOIN categories c ON b.category_id = c.id
             WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3`,
            [userId, month, year]
        );

        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1) : 0;

        const categorySpending = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = t.category_name || 'Uncategorized';
            categorySpending[cat] = (categorySpending[cat] || 0) + parseFloat(t.amount);
        });
        const topCategories = Object.entries(categorySpending)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, amount]) => ({ name, amount }));

        const context = JSON.stringify({
            month: now.toLocaleString('default', { month: 'long' }),
            year,
            totalIncome,
            totalExpenses,
            savingsRate,
            topCategories,
            budgets: budgets.map(b => ({
                category: b.category_name,
                budgeted: parseFloat(b.amount),
                spent: categorySpending[b.category_name] || 0,
            })),
            transactionCount: transactions.length,
        });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `You are a friendly personal finance advisor. Based on this month's data, write a 3-4 sentence summary in plain English. Be specific with numbers. Mention what went well and what to watch out for. Keep it conversational, not robotic. Use ₹ for amounts. Data: ${context}`,
            }],
            max_tokens: 1000,
        });

        res.json({ report: completion.choices[0].message.content.trim() });
    } catch (err) {
        console.error('AI report error:', err.message);
        res.json({ report: 'Unable to generate your report right now. Please try again in a moment.' });
    }
});

// ─── FEATURE 3: Can I Afford This? ─────────────────────────────────
router.post('/afford', authMiddleware, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        const userId = req.user.id;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const [txRes, budgetRes, goalRes] = await Promise.all([
            pool.query(
                `SELECT t.*, c.name as category_name FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND EXTRACT(MONTH FROM t.date) = $2 AND EXTRACT(YEAR FROM t.date) = $3
                 ORDER BY t.date DESC`,
                [userId, month, year]
            ),
            pool.query(`SELECT b.*, c.name as category_name FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3`, [userId, month, year]),
            pool.query(`SELECT * FROM savings_goals WHERE user_id = $1`, [userId]),
        ]);

        const transactions = txRes.rows;
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1) : 0;

        const context = JSON.stringify({
            totalIncome, totalExpenses, savingsRate,
            balance: totalIncome - totalExpenses,
            budgets: budgetRes.rows.map(b => ({ category: b.category_name, budgeted: parseFloat(b.amount) })),
            goals: goalRes.rows.map(g => ({ name: g.name, target: parseFloat(g.target_amount), saved: parseFloat(g.saved_amount), deadline: g.deadline })),
        });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `The user is asking: "${query}"
Based on their financial data below, give a direct yes/no recommendation on whether they can afford it, and explain why in 2-3 sentences. Consider their current savings rate, budget status, and active goals. Be honest but encouraging. Use ₹ for amounts.
Also include a "sentiment" field in your response: "positive", "cautious", or "negative".
Return ONLY valid JSON (no markdown): { "recommendation": "your recommendation text", "sentiment": "positive" | "cautious" | "negative" }
Financial data: ${context}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json(parsed);
    } catch (err) {
        console.error('AI afford error:', err.message);
        res.json({ recommendation: 'Unable to analyse right now. Please try again in a moment.', sentiment: 'cautious' });
    }
});

// ─── FEATURE 2: AI Chat ─────────────────────────────────────────────
router.post('/chat', authMiddleware, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful financial advisor for an Indian personal finance app called FinTrack. Give clear, practical advice. Keep responses concise and relevant to personal finance. Use INR (₹) for currency.`,
                },
                { role: 'user', content: message },
            ],
            max_tokens: 1000,
        });
        const reply = completion.choices[0].message.content;

        res.json({ reply });
    } catch (err) {
        console.error('AI chat error:', err.message);
        res.status(500).json({ error: 'AI chat unavailable' });
    }
});

// ─── FEATURE 5: Detect Recurring Patterns ───────────────────────────
router.get('/detect-patterns', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const [txRes, recurRes] = await Promise.all([
            pool.query(
                `SELECT t.*, c.name as category_name FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.date >= NOW() - INTERVAL '3 months'
                 ORDER BY t.date DESC`,
                [userId]
            ),
            pool.query(`SELECT * FROM recurring_transactions WHERE user_id = $1`, [userId]),
        ]);

        const transactions = txRes.rows.map(t => ({
            date: t.date, type: t.type, amount: parseFloat(t.amount),
            description: t.description, category: t.category_name,
        }));
        const existing = recurRes.rows.map(r => ({
            description: r.description, amount: parseFloat(r.amount), frequency: r.frequency,
        }));

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Analyse these transactions and identify any that appear to be recurring (same merchant, similar amount, repeating monthly or weekly). Exclude transactions already in the recurring list provided.
Return ONLY valid JSON array (no markdown):
[{ "description": string, "amount": number, "frequency": "monthly" or "weekly", "merchant": string, "confidence": "high" or "medium" }]
If none found, return an empty array [].
Transactions: ${JSON.stringify(transactions)}
Existing recurring: ${JSON.stringify(existing)}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const patterns = JSON.parse(jsonStr);
        res.json({ patterns: Array.isArray(patterns) ? patterns : [] });
    } catch (err) {
        console.error('AI detect-patterns error:', err.message);
        res.json({ patterns: [] });
    }
});

// ─── FEATURE 6: Parse Receipt Image ────────────────────────────────
router.post('/parse-image', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Image file is required' });

        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        const model = getVisionModel();
        const result = await model.generateContent([
            {
                inlineData: { data: base64, mimeType },
            },
            {
                text: `This is a receipt, bill, or payment screenshot. Extract the transaction details and return ONLY valid JSON (no markdown):
{
  "amount": number,
  "type": "expense",
  "description": string,
  "date": "YYYY-MM-DD",
  "merchant": string,
  "category_hint": string
}
If you cannot extract a field, use null.`,
            },
        ]);

        const text = result.response.text().trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json({ parsed });
    } catch (err) {
        console.error('AI parse-image error:', err.message);
        res.json({ parsed: null, error: 'Could not parse the image. Please enter details manually.' });
    }
});

// ─── FEATURE 8: Parse Split Text ────────────────────────────────────
router.post('/parse-split', authMiddleware, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required' });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Parse this expense split description and return ONLY valid JSON (no markdown):
{
  "description": string,
  "total_amount": number,
  "split_count": number,
  "participants": [{ "name": string }]
}
If you cannot extract a field, use null. Text: ${text}`,
            }],
            max_tokens: 1000,
        });

        const responseText = completion.choices[0].message.content.trim();
        const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json({ parsed });
    } catch (err) {
        console.error('AI parse-split error:', err.message);
        res.json({ parsed: null, error: 'Could not parse. Please enter details manually.' });
    }
});

// ─── FEATURE: Salary Day Intelligence ───────────────────────────────
router.get('/salary-intelligence', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const { rows: incomeRows } = await pool.query(
            `SELECT t.*, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND t.type = 'income'
               AND t.date >= NOW() - INTERVAL '4 months'
             ORDER BY t.date DESC`,
            [userId]
        );

        const { rows: expenses } = await pool.query(
            `SELECT t.*, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND t.type = 'expense'
               AND EXTRACT(MONTH FROM t.date) = $2 AND EXTRACT(YEAR FROM t.date) = $3`,
            [userId, month, year]
        );

        const { rows: currentIncome } = await pool.query(
            `SELECT * FROM transactions
             WHERE user_id = $1 AND type = 'income'
               AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
             ORDER BY amount DESC`,
            [userId, month, year]
        );

        if (currentIncome.length === 0) {
            return res.json({ detected: false, salary: null, plan: null });
        }

        const categorySpending = {};
        expenses.forEach(t => {
            const cat = t.category_name || 'Uncategorized';
            categorySpending[cat] = (categorySpending[cat] || 0) + parseFloat(t.amount);
        });

        const context = JSON.stringify({
            currentMonthIncome: currentIncome.map(t => ({
                amount: parseFloat(t.amount),
                description: t.description,
                date: t.date,
            })),
            recentIncomeHistory: incomeRows.slice(0, 20).map(t => ({
                amount: parseFloat(t.amount),
                description: t.description,
                date: t.date,
            })),
            currentMonthSpending: categorySpending,
            totalExpenses: expenses.reduce((s, t) => s + parseFloat(t.amount), 0),
        });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Analyse this user's income transactions and identify their salary (the largest or most regular income).
Return ONLY valid JSON (no markdown):
{
  "is_salary_detected": boolean,
  "salary_amount": number,
  "salary_description": string,
  "allocation_plan": {
    "savings": { "percentage": number, "amount": number, "reason": string },
    "rent": { "percentage": number, "amount": number, "reason": string },
    "food": { "percentage": number, "amount": number, "reason": string },
    "transport": { "percentage": number, "amount": number, "reason": string },
    "investments": { "percentage": number, "amount": number, "reason": string },
    "discretionary": { "percentage": number, "amount": number, "reason": string }
  },
  "insight": "one sentence summary"
}
Base the allocation plan on their actual spending history. Data: ${context}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json({ detected: parsed.is_salary_detected, salary: parsed.salary_amount, description: parsed.salary_description, plan: parsed.allocation_plan, insight: parsed.insight });
    } catch (err) {
        console.error('AI salary-intelligence error:', err.message);
        res.json({ detected: false, salary: null, plan: null });
    }
});

// ─── FEATURE: Financial Personality Profile ─────────────────────────
router.post('/personality', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const [txRes, budgetRes, goalRes] = await Promise.all([
            pool.query(
                `SELECT t.*, c.name as category_name
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.date >= NOW() - INTERVAL '90 days'
                 ORDER BY t.date DESC`,
                [userId]
            ),
            pool.query(
                `SELECT b.*, c.name as category_name FROM budgets b
                 LEFT JOIN categories c ON b.category_id = c.id
                 WHERE b.user_id = $1`,
                [userId]
            ),
            pool.query('SELECT * FROM savings_goals WHERE user_id = $1', [userId]),
        ]);

        const transactions = txRes.rows;
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);

        const context = JSON.stringify({
            transactionCount: transactions.length,
            totalIncome,
            totalExpenses,
            savingsRate: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1) : 0,
            transactions: transactions.slice(0, 50).map(t => ({
                type: t.type, amount: parseFloat(t.amount), category: t.category_name, date: t.date,
            })),
            budgetsSet: budgetRes.rows.length,
            goalsSet: goalRes.rows.length,
            goalsProgress: goalRes.rows.map(g => ({
                target: parseFloat(g.target_amount),
                saved: parseFloat(g.saved_amount),
                pct: g.target_amount > 0 ? (parseFloat(g.saved_amount) / parseFloat(g.target_amount) * 100).toFixed(0) : 0,
            })),
        });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Analyse this user's last 90 days of financial data and score them across 5 dimensions.
Return ONLY valid JSON (no markdown):
{
  "personality_type": "e.g. Cautious Saver / Balanced Planner / Impulsive Spender / Strategic Investor / etc.",
  "personality_emoji": "single emoji",
  "overall_score": number (0-100),
  "dimensions": {
    "consistency": { "score": number, "label": string, "description": "2 sentences" },
    "discipline": { "score": number, "label": string, "description": "2 sentences" },
    "goal_focus": { "score": number, "label": string, "description": "2 sentences" },
    "risk_appetite": { "score": number, "label": string, "description": "2 sentences" },
    "savings_habit": { "score": number, "label": string, "description": "2 sentences" }
  },
  "summary": "2-3 sentence overall profile summary"
}
Data: ${context}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json(parsed);
    } catch (err) {
        console.error('AI personality error:', err.message);
        res.status(500).json({ error: 'Could not generate personality profile.' });
    }
});

// ─── FEATURE: Regret Patterns ────────────────────────────────────────
router.get('/regret-patterns', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const { rows: regretted } = await pool.query(
            `SELECT t.*, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND t.is_regretted = true
             ORDER BY t.date DESC`,
            [userId]
        );

        if (regretted.length === 0) {
            return res.json({ patterns: null, insight: null, count: 0 });
        }

        const context = JSON.stringify(regretted.map(t => ({
            amount: parseFloat(t.amount),
            description: t.description,
            category: t.category_name,
            date: t.date,
        })));

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Analyse these transactions that the user has marked as "regretted".
Identify patterns and return ONLY valid JSON (no markdown):
{
  "insight": "2-3 sentences describing the main regret patterns, be specific with amounts and categories",
  "patterns": [
    { "pattern": string, "count": number, "total_amount": number, "tip": string }
  ]
}
Transactions: ${context}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json({ ...parsed, count: regretted.length, total: regretted.reduce((s, t) => s + parseFloat(t.amount), 0) });
    } catch (err) {
        console.error('AI regret-patterns error:', err.message);
        res.json({ patterns: null, insight: null, count: 0 });
    }
});

// ─── FEATURE: Life Event Planning ────────────────────────────────────
router.post('/life-event', authMiddleware, async (req, res) => {
    try {
        const { event_type, target_amount, target_date } = req.body;
        if (!event_type || !target_amount || !target_date)
            return res.status(400).json({ error: 'event_type, target_amount, and target_date are required.' });

        const userId = req.user.id;

        const { rows: recentTx } = await pool.query(
            `SELECT type, amount FROM transactions
             WHERE user_id = $1 AND date >= NOW() - INTERVAL '3 months'`,
            [userId]
        );

        const totalIncome = recentTx.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = recentTx.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const avgMonthlySavings = (totalIncome - totalExpenses) / 3;

        const now = new Date();
        const target = new Date(target_date);
        const monthsUntilTarget = Math.max(1, Math.ceil((target - now) / (1000 * 60 * 60 * 24 * 30)));

        const context = JSON.stringify({
            event_type,
            target_amount: parseFloat(target_amount),
            target_date,
            months_until_target: monthsUntilTarget,
            avg_monthly_savings: avgMonthlySavings,
            avg_monthly_income: totalIncome / 3,
        });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Create a monthly savings milestone plan for this life event.
Return ONLY valid JSON (no markdown):
{
  "monthly_required": number,
  "is_achievable": boolean,
  "difficulty": "easy" | "moderate" | "challenging",
  "milestones": [
    { "month": number, "label": string, "target_saved": number, "action": string }
  ],
  "tips": ["tip1", "tip2", "tip3"],
  "summary": "2 sentence motivational summary"
}
Limit milestones to 6 key checkpoints. Data: ${context}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const plan = JSON.parse(jsonStr);

        const goalResult = await pool.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, deadline, color, event_type, ai_plan)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                userId,
                `${event_type.charAt(0).toUpperCase() + event_type.slice(1)} Fund`,
                parseFloat(target_amount),
                target_date,
                '#3b82f6',
                event_type,
                JSON.stringify(plan),
            ]
        );

        res.json({ goal: goalResult.rows[0], plan });
    } catch (err) {
        console.error('AI life-event error:', err.message);
        res.status(500).json({ error: 'Could not create life event plan.' });
    }
});

// ─── FEATURE: Spending Forecast Calendar ─────────────────────────────
router.get('/forecast-calendar', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const [recurringRes, historyRes] = await Promise.all([
            pool.query(
                `SELECT r.*, c.name as category_name, c.color as category_color
                 FROM recurring_transactions r
                 LEFT JOIN categories c ON r.category_id = c.id
                 WHERE r.user_id = $1 AND r.is_active = true`,
                [userId]
            ),
            pool.query(
                `SELECT t.*, c.name as category_name, c.color as category_color
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.type = 'expense'
                   AND t.date >= NOW() - INTERVAL '3 months'
                 ORDER BY t.date DESC`,
                [userId]
            ),
        ]);

        const now = new Date();
        const predictions = [];

        for (const r of recurringRes.rows) {
            if (r.frequency === 'monthly' && r.day_of_month) {
                const nextDate = new Date(now.getFullYear(), now.getMonth(), r.day_of_month);
                if (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1);
                if ((nextDate - now) / (1000 * 60 * 60 * 24) <= 30) {
                    predictions.push({
                        date: nextDate.toISOString().split('T')[0],
                        predicted_amount: parseFloat(r.amount),
                        source: 'recurring',
                        description: r.description,
                        category: r.category_name || 'Recurring',
                        category_color: r.category_color || '#6b7280',
                        confidence: 'high',
                    });
                }
            } else if (r.frequency === 'weekly') {
                for (let d = 1; d <= 30; d += 7) {
                    const nextDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
                    predictions.push({
                        date: nextDate.toISOString().split('T')[0],
                        predicted_amount: parseFloat(r.amount),
                        source: 'recurring',
                        description: r.description,
                        category: r.category_name || 'Recurring',
                        category_color: r.category_color || '#6b7280',
                        confidence: 'high',
                    });
                }
            }
        }

        if (historyRes.rows.length > 5) {
            const context = JSON.stringify({
                history: historyRes.rows.slice(0, 60).map(t => ({
                    date: t.date, amount: parseFloat(t.amount), category: t.category_name,
                })),
                existing_predictions: predictions.map(p => p.date),
                today: now.toISOString().split('T')[0],
            });

            const groq = getGroqClient();
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [{
                    role: 'user',
                    content: `Based on this spending history, predict likely expenses for the next 30 days.
Look for weekly patterns, day-of-week patterns, and monthly patterns.
Return ONLY valid JSON array (no markdown, max 10 predictions):
[{ "date": "YYYY-MM-DD", "predicted_amount": number, "description": string, "category": string, "confidence": "medium" | "low" }]
Only predict dates within the next 30 days from today. Data: ${context}`,
                }],
                max_tokens: 1000,
            });

            try {
                const text = completion.choices[0].message.content.trim();
                const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const aiPredictions = JSON.parse(jsonStr);
                if (Array.isArray(aiPredictions)) {
                    aiPredictions.forEach(p => {
                        predictions.push({
                            ...p,
                            source: 'ai',
                            category_color: '#8b5cf6',
                        });
                    });
                }
            } catch { /* silent — use recurring predictions only */ }
        }

        res.json({ predictions: predictions.sort((a, b) => a.date.localeCompare(b.date)) });
    } catch (err) {
        console.error('AI forecast-calendar error:', err.message);
        res.json({ predictions: [] });
    }
});

// ─── FEATURE: Financial Health Report Card ───────────────────────────
router.post('/health-report', authMiddleware, async (req, res) => {
    try {
        const { month, year } = req.body;
        const userId = req.user.id;
        const targetMonth = month || (new Date().getMonth() + 1);
        const targetYear = year || new Date().getFullYear();

        const [txRes, budgetRes, goalRes] = await Promise.all([
            pool.query(
                `SELECT t.*, c.name as category_name
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1
                   AND EXTRACT(MONTH FROM t.date) = $2
                   AND EXTRACT(YEAR FROM t.date) = $3
                 ORDER BY t.date DESC`,
                [userId, targetMonth, targetYear]
            ),
            pool.query(
                `SELECT b.*, c.name as category_name FROM budgets b
                 LEFT JOIN categories c ON b.category_id = c.id
                 WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3`,
                [userId, targetMonth, targetYear]
            ),
            pool.query('SELECT * FROM savings_goals WHERE user_id = $1', [userId]),
        ]);

        const transactions = txRes.rows;
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0;

        const categorySpending = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = t.category_name || 'Uncategorized';
            categorySpending[cat] = (categorySpending[cat] || 0) + parseFloat(t.amount);
        });
        const topCategories = Object.entries(categorySpending)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, amount]) => ({ name, amount }));

        const budgetPerformance = budgetRes.rows.map(b => ({
            category: b.category_name,
            budgeted: parseFloat(b.amount),
            spent: categorySpending[b.category_name] || 0,
            pct: b.amount > 0 ? ((categorySpending[b.category_name] || 0) / parseFloat(b.amount) * 100).toFixed(0) : 0,
        }));

        const goalsProgress = goalRes.rows.map(g => ({
            name: g.name,
            target: parseFloat(g.target_amount),
            saved: parseFloat(g.saved_amount),
            pct: g.target_amount > 0 ? (parseFloat(g.saved_amount) / parseFloat(g.target_amount) * 100).toFixed(0) : 0,
        }));

        const context = JSON.stringify({
            month: targetMonth, year: targetYear,
            totalIncome, totalExpenses, savingsRate: savingsRate.toFixed(1),
            balance: totalIncome - totalExpenses,
            topCategories, budgetPerformance, goalsProgress,
            transactionCount: transactions.length,
        });

        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Generate a financial health report card for this month's data.
Return ONLY valid JSON (no markdown):
{
  "health_score": number (0-100),
  "grade": "A+" | "A" | "B" | "C" | "D" | "F",
  "narrative": "3-4 sentences plain English summary, specific with numbers",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "scores": {
    "income_stability": number,
    "expense_control": number,
    "budget_adherence": number,
    "savings_rate": number,
    "goal_progress": number
  }
}
Data: ${context}`,
            }],
            max_tokens: 1000,
        });

        const text = completion.choices[0].message.content.trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const report = JSON.parse(jsonStr);

        res.json({
            ...report,
            summary: { totalIncome, totalExpenses, savingsRate: parseFloat(savingsRate.toFixed(1)), balance: totalIncome - totalExpenses, transactionCount: transactions.length },
            topCategories,
            budgetPerformance,
            goalsProgress,
            month: targetMonth,
            year: targetYear,
        });
    } catch (err) {
        console.error('AI health-report error:', err.message);
        res.status(500).json({ error: 'Could not generate health report.' });
    }
});

module.exports = router;
