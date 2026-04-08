const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getVisionModel } = require('../utils/gemini');
const { aiComplete } = require('../utils/ai');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── AI Cache Helpers (configurable TTL stored in users.ai_cache) ───
const getCached = async (pool, userId, key, ttlMs = 6 * 60 * 60 * 1000) => {
    const result = await pool.query('SELECT ai_cache FROM users WHERE id = $1', [userId]);
    const cache = result.rows[0]?.ai_cache || {};
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - new Date(entry.generated_at).getTime() > ttlMs) return null;
    return entry.data;
};

const setCached = async (pool, userId, key, data) => {
    const result = await pool.query('SELECT ai_cache FROM users WHERE id = $1', [userId]);
    const cache = result.rows[0]?.ai_cache || {};
    cache[key] = { data, generated_at: new Date().toISOString() };
    await pool.query('UPDATE users SET ai_cache = $1 WHERE id = $2', [JSON.stringify(cache), userId]);
};

// ─── FEATURE 4: Parse SMS ───────────────────────────────────────────
router.post('/parse-sms', authMiddleware, async (req, res) => {
    try {
        const { sms } = req.body;
        if (!sms) return res.status(400).json({ error: 'SMS text is required' });

        const today = new Date().toISOString().split('T')[0];
        const text = (await aiComplete('parse-sms', [{
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
        }])).trim();
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

        const report = (await aiComplete('report', [{
            role: 'user',
            content: `You are a friendly personal finance advisor. Based on this month's data, write a 3-4 sentence summary in plain English. Be specific with numbers. Mention what went well and what to watch out for. Keep it conversational, not robotic. Use ₹ for amounts. Data: ${context}`,
        }])).trim();

        res.json({ report });
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

        const text = (await aiComplete('afford', [{
            role: 'user',
            content: `The user is asking: "${query}"
Based on their financial data below, give a direct yes/no recommendation on whether they can afford it, and explain why in 2-3 sentences. Consider their current savings rate, budget status, and active goals. Be honest but encouraging. Use ₹ for amounts.
Also include a "sentiment" field in your response: "positive", "cautious", or "negative".
Return ONLY valid JSON (no markdown): { "recommendation": "your recommendation text", "sentiment": "positive" | "cautious" | "negative" }
Financial data: ${context}`,
        }])).trim();
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
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        const userId = req.user.id;

        // Fetch financial context in parallel
        const [monthlySummary, recentTransactions, budgetResult, goalResult] = await Promise.all([
            pool.query(`
                SELECT
                  TO_CHAR(DATE_TRUNC('month', t.date), 'Month YYYY') AS month_label,
                  DATE_TRUNC('month', t.date) AS month,
                  t.type,
                  c.name AS category,
                  SUM(t.amount) AS total,
                  COUNT(*) AS count
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE t.user_id = $1
                  AND t.date >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
                GROUP BY DATE_TRUNC('month', t.date), t.type, c.name
                ORDER BY month DESC, t.type, total DESC
            `, [userId]),
            pool.query(`
                SELECT
                  t.date,
                  t.amount,
                  t.type,
                  t.description,
                  c.name AS category
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE t.user_id = $1
                  AND t.date >= NOW() - INTERVAL '90 days'
                ORDER BY t.date DESC
                LIMIT 200
            `, [userId]),
            pool.query(`
                SELECT c.name AS category, b.amount AS budget_limit,
                    COALESCE(SUM(t.amount), 0) AS spent
                FROM budgets b
                JOIN categories c ON c.id = b.category_id
                LEFT JOIN transactions t ON t.category_id = b.category_id
                    AND t.user_id = $1 AND t.type = 'expense'
                    AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', NOW())
                WHERE b.user_id = $1
                    AND b.month = EXTRACT(MONTH FROM NOW())
                    AND b.year = EXTRACT(YEAR FROM NOW())
                GROUP BY c.name, b.amount
            `, [userId]),
            pool.query(
                `SELECT name, target_amount, saved_amount, deadline FROM savings_goals WHERE user_id = $1`,
                [userId]
            ),
        ]);

        // Build monthly summary text
        const monthlyMap = {};
        for (const row of monthlySummary.rows) {
            const label = row.month_label.trim();
            if (!monthlyMap[label]) monthlyMap[label] = { income: [], expenses: [] };
            if (row.type === 'income') monthlyMap[label].income.push(`${row.category}: ₹${Math.round(row.total)}`);
            if (row.type === 'expense') monthlyMap[label].expenses.push(`${row.category}: ₹${Math.round(row.total)}`);
        }

        let monthlySummaryText = '';
        for (const [month, data] of Object.entries(monthlyMap)) {
            const totalIncome = monthlySummary.rows
                .filter(r => r.month_label.trim() === month && r.type === 'income')
                .reduce((s, r) => s + parseFloat(r.total), 0);
            const totalExpense = monthlySummary.rows
                .filter(r => r.month_label.trim() === month && r.type === 'expense')
                .reduce((s, r) => s + parseFloat(r.total), 0);

            monthlySummaryText += `\n### ${month}\n`;
            monthlySummaryText += `Total Income: ₹${Math.round(totalIncome)}\n`;
            monthlySummaryText += `Total Expenses: ₹${Math.round(totalExpense)}\n`;
            if (data.income.length) monthlySummaryText += `Income breakdown: ${data.income.join(', ')}\n`;
            if (data.expenses.length) monthlySummaryText += `Expense breakdown: ${data.expenses.join(', ')}\n`;
        }

        const recentTxText = recentTransactions.rows
            .map(t => `${t.date.toISOString().split('T')[0]} | ${t.type} | ${t.category} | ₹${Math.round(t.amount)} | ${t.description || ''}`)
            .join('\n');

        const budgets = budgetResult.rows;
        const overBudget = budgets.filter(b => Number(b.spent) > Number(b.budget_limit));
        const goals = goalResult.rows;
        const user = req.user;

        const systemPrompt = `You are an expert personal finance advisor for an Indian user named ${user.full_name || user.name || 'the user'}.

You have access to their COMPLETE financial data for the last 6 months. Always use this data to answer questions accurately. Never say you don't have data for a month if it appears below.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
CURRENCY: Indian Rupees (₹)

## MONTHLY SUMMARY (last 6 months)
${monthlySummaryText}

## RECENT INDIVIDUAL TRANSACTIONS (last 90 days)
Date | Type | Category | Amount | Description
${recentTxText}

## BUDGET STATUS (this month)
${budgets.length > 0 ? budgets.map(b => `${b.category}: ₹${Math.round(Number(b.spent))} of ₹${Math.round(Number(b.budget_limit))}${Number(b.spent) > Number(b.budget_limit) ? ' ⚠️ OVER BUDGET' : ''}`).join('\n') : 'No budgets set'}
${overBudget.length > 0 ? `Over budget: ${overBudget.map(b => `${b.category} by ₹${Math.round(Number(b.spent) - Number(b.budget_limit))}`).join(', ')}` : ''}

## FINANCIAL GOALS
${goals.length > 0 ? goals.map(g => `${g.name}: ₹${Math.round(Number(g.saved_amount))} saved of ₹${Math.round(Number(g.target_amount))}${g.deadline ? ` (deadline: ${g.deadline})` : ''}`).join('\n') : 'No goals set'}

RULES:
- Always answer based on the data above
- If asked about a specific month, look it up in the Monthly Summary section
- Use ₹ symbol and Indian number formatting (e.g. ₹1,538 not ₹1538.00)
- Be concise and specific — give exact numbers from the data
- Never say "I don't have data" if the month appears in the Monthly Summary above
- Keep responses under 150 words unless a detailed breakdown is requested`;

        const reply = await aiComplete('chat', [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6),
            { role: 'user', content: message },
        ]);

        res.json({ reply });
    } catch (err) {
        console.error('Groq chat error:', err?.message || err);
        const is429 = err?.status === 429 || err?.response?.status === 429;
        res.status(500).json({
            error: is429
                ? 'AI is taking a short break due to high usage. Please wait a few minutes and try again.'
                : 'Failed to get AI response',
            message: err?.message,
        });
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

        const text = (await aiComplete('recurring', [{
            role: 'user',
            content: `Analyse these transactions and identify any that appear to be recurring (same merchant, similar amount, repeating monthly or weekly). Exclude transactions already in the recurring list provided.
Return ONLY valid JSON array (no markdown):
[{ "description": string, "amount": number, "frequency": "monthly" or "weekly", "merchant": string, "confidence": "high" or "medium" }]
If none found, return an empty array [].
Transactions: ${JSON.stringify(transactions)}
Existing recurring: ${JSON.stringify(existing)}`,
        }])).trim();
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

        const responseText = (await aiComplete('parse-split', [{
            role: 'user',
            content: `Parse this expense split description and return ONLY valid JSON (no markdown):
{
  "description": string,
  "total_amount": number,
  "split_count": number,
  "participants": [{ "name": string }]
}
If you cannot extract a field, use null. Text: ${text}`,
        }])).trim();
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

        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'salary_intelligence');
            if (cached) return res.json({ ...cached, from_cache: true });
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

        const text = (await aiComplete('salary-intelligence', [
            {
                role: 'system',
                content: 'You are a financial analysis assistant. Always respond with valid JSON only, no markdown, no explanation.',
            },
            {
                role: 'user',
                content: `Analyse this income data and identify the user's salary (largest or most regular income). Return this exact JSON structure with real values filled in:
{
  "is_salary_detected": true,
  "salary_amount": 50000,
  "salary_description": "Monthly salary",
  "allocation_plan": {
    "savings":       { "percentage": 20, "amount": 10000, "reason": "Build emergency fund" },
    "rent":          { "percentage": 30, "amount": 15000, "reason": "Housing cost" },
    "food":          { "percentage": 15, "amount": 7500,  "reason": "Groceries and dining" },
    "transport":     { "percentage": 10, "amount": 5000,  "reason": "Commute and fuel" },
    "investments":   { "percentage": 15, "amount": 7500,  "reason": "Long-term wealth" },
    "discretionary": { "percentage": 10, "amount": 5000,  "reason": "Leisure and personal" }
  },
  "insight": "Your salary covers expenses with room for savings."
}
Base percentages and amounts on their actual spending. Data: ${context}`,
            },
        ])).trim();
        // Extract first complete JSON object in case of any surrounding text
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        const jsonStr = start !== -1 && end !== -1 ? text.slice(start, end + 1) : text;
        const parsed = JSON.parse(jsonStr);
        const salaryData = { detected: parsed.is_salary_detected, salary: parsed.salary_amount, description: parsed.salary_description, plan: parsed.allocation_plan, insight: parsed.insight };
        await setCached(pool, userId, 'salary_intelligence', salaryData);
        res.json({ ...salaryData, from_cache: false });
    } catch (err) {
        console.error('AI salary-intelligence error:', err.message);
        res.json({ detected: false, salary: null, plan: null });
    }
});

// ─── FEATURE: Financial Personality Profile ─────────────────────────
router.post('/personality', authMiddleware, async (req, res) => {
    try {
        console.log('Personality route hit for user:', req.user.id);
        const userId = req.user.id;

        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'personality', 24 * 60 * 60 * 1000);
            if (cached && cached.dimensions && typeof cached.overall_score === 'number') {
                return res.json({ ...cached, from_cache: true });
            }
        }

        const result = await pool.query(`
            SELECT t.amount, t.type, t.date,
                COALESCE(c.name, 'Uncategorized') as category
            FROM transactions t
            LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.user_id = $1 AND t.date >= NOW() - INTERVAL '90 days'
            ORDER BY t.date DESC LIMIT 200
        `, [userId]);

        console.log('Transactions fetched:', result.rows.length);

        if (result.rows.length < 3) {
            return res.status(400).json({
                error: 'Not enough data',
                message: 'Add at least a few transactions before generating your personality profile.',
            });
        }

        const txns = result.rows;
        const expensesByCategory = {};
        let totalExpenses = 0;
        let totalIncome = 0;

        txns.forEach(t => {
            if (t.type === 'expense') {
                expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Number(t.amount);
                totalExpenses += Number(t.amount);
            } else {
                totalIncome += Number(t.amount);
            }
        });

        const topCategories = Object.entries(expensesByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([cat, amt]) => ({
                category: cat,
                amount: Math.round(amt),
                percentage: totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(1) : 0,
            }));

        const savingsRate = totalIncome > 0
            ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1) : 0;

        const prompt = `Analyse this person's spending and create a financial personality profile.

SPENDING DATA (last 90 days):
Total Income:      ₹${Math.round(totalIncome).toLocaleString('en-IN')}
Total Expenses:    ₹${Math.round(totalExpenses).toLocaleString('en-IN')}
Savings Rate:      ${savingsRate}%
Transaction Count: ${txns.length}

TOP SPENDING CATEGORIES:
${topCategories.map(c => `${c.category}: ₹${c.amount.toLocaleString('en-IN')} (${c.percentage}%)`).join('\n')}

Return ONLY valid JSON with NO markdown, NO backticks:
{
  "personality_type": "<2-3 word type e.g. The Mindful Spender>",
  "personality_emoji": "<single emoji that represents this type>",
  "overall_score": <number 0-100 representing overall financial health>,
  "summary": "<2 sentences summarising their financial personality using real numbers>",
  "dimensions": {
    "consistency": { "score": <0-100>, "label": "<2-word label e.g. Steady Eddie>", "description": "<1 sentence based on their data>" },
    "discipline": { "score": <0-100>, "label": "<2-word label>", "description": "<1 sentence>" },
    "goal_focus": { "score": <0-100>, "label": "<2-word label>", "description": "<1 sentence>" },
    "risk_appetite": { "score": <0-100>, "label": "<2-word label>", "description": "<1 sentence>" },
    "savings_habit": { "score": <0-100>, "label": "<2-word label>", "description": "<1 sentence>" }
  }
}`;

        console.log('Sending to Groq...');

        const raw = await aiComplete('personality', [{ role: 'user', content: prompt }]);

        console.log('AI response received. Preview:', raw.slice(0, 200));

        const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

        let personality;
        try {
            personality = JSON.parse(clean);
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr.message);
            console.error('Raw was:', raw);
            return res.status(500).json({
                error: 'Failed to parse personality response',
                raw: clean.slice(0, 500),
            });
        }

        console.log('Personality generated successfully');
        await setCached(pool, userId, 'personality', personality);
        res.json({ ...personality, from_cache: false });
    } catch (err) {
        console.error('Personality generation error:', err?.message || err);
        const is429 = err?.status === 429 || err?.response?.status === 429;
        res.status(500).json({
            error: is429
                ? 'AI is busy. Please wait a few minutes and try again.'
                : 'Failed to generate personality profile',
            message: err?.message,
        });
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

        const text = (await aiComplete('regret-patterns', [{
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
        }])).trim();
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

        const text = (await aiComplete('life-event', [{
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
        }])).trim();
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

// ─── FEATURE: Spending Forecast ──────────────────────────────────────
router.get('/forecast-calendar', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Require at least 7 days of data (check oldest transaction)
        const { rows: oldestRows } = await pool.query(
            `SELECT MIN(date) AS oldest FROM transactions WHERE user_id = $1`,
            [userId]
        );
        const oldest = oldestRows[0]?.oldest;
        if (!oldest || (Date.now() - new Date(oldest).getTime()) < 7 * 24 * 60 * 60 * 1000) {
            return res.json({
                success: true,
                data: { insufficientData: true },
                from_cache: false,
            });
        }

        // 1. Current month total — identical query to dashboard
        const currentMonthResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM transactions
             WHERE user_id = $1
               AND type = 'expense'
               AND DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW())`,
            [userId]
        );
        const currentMonthSpent = parseFloat(currentMonthResult.rows[0].total);

        // 2. Date math
        const today = new Date();
        const daysElapsed = today.getDate();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysRemaining = daysInMonth - daysElapsed;

        // 3. Daily average = current spend / days elapsed (not 3-month / 90)
        const avgDaily = daysElapsed > 0 ? Math.round(currentMonthSpent / daysElapsed) : 0;

        // 4. Forecasted total = current pace projected to end of month
        const totalForecast = daysElapsed > 0
            ? Math.round((currentMonthSpent / daysElapsed) * daysInMonth)
            : 0;

        // 5. Category breakdown — last 3 months average (display only)
        const [categoryResult, currentCategoryResult, dailyResult] = await Promise.all([
            pool.query(
                `SELECT
                   c.name AS category,
                   c.icon,
                   c.color,
                   ROUND(SUM(t.amount) / 3) AS avg_monthly
                 FROM transactions t
                 JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1
                   AND t.type = 'expense'
                   AND t.date >= DATE_TRUNC('month', NOW()) - INTERVAL '3 months'
                   AND t.date < DATE_TRUNC('month', NOW())
                 GROUP BY c.name, c.icon, c.color
                 HAVING SUM(t.amount) > 0
                 ORDER BY avg_monthly DESC`,
                [userId]
            ),
            pool.query(
                `SELECT
                   c.name AS category,
                   COALESCE(SUM(t.amount), 0) AS spent_so_far
                 FROM transactions t
                 JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1
                   AND t.type = 'expense'
                   AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', NOW())
                 GROUP BY c.name`,
                [userId]
            ),
            pool.query(
                `SELECT
                   EXTRACT(DAY FROM date)::int AS day,
                   SUM(amount) AS daily_total
                 FROM transactions
                 WHERE user_id = $1
                   AND type = 'expense'
                   AND DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW())
                 GROUP BY EXTRACT(DAY FROM date)
                 ORDER BY day`,
                [userId]
            ),
        ]);

        // 6. Build categories
        const spentByCategory = {};
        for (const row of currentCategoryResult.rows) {
            spentByCategory[row.category] = parseFloat(row.spent_so_far);
        }

        const categories = categoryResult.rows.map(row => ({
            name: row.category,
            icon: row.icon || '',
            color: row.color || null,
            avgMonthly: Math.round(parseFloat(row.avg_monthly)),
            spentSoFar: Math.round(spentByCategory[row.category] || 0),
            percentOfTotal: totalForecast > 0
                ? Math.round((parseFloat(row.avg_monthly) / totalForecast) * 100)
                : 0,
        }));

        // 7. Calendar days
        const actualByDay = {};
        for (const row of dailyResult.rows) {
            actualByDay[parseInt(row.day)] = Math.round(parseFloat(row.daily_total));
        }

        const calendarDays = [];
        for (let d = 1; d <= daysInMonth; d++) {
            if (d < daysElapsed) {
                calendarDays.push({ day: d, actual: actualByDay[d] || 0, isFuture: false });
            } else if (d === daysElapsed) {
                calendarDays.push({ day: d, actual: actualByDay[d] || 0, isFuture: false, isToday: true });
            } else {
                calendarDays.push({ day: d, projected: avgDaily, isFuture: true });
            }
        }

        // 8. AI insight using corrected numbers
        const insightPrompt = `You are a personal finance advisor for an Indian user.

Their ${today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })} data:
- Days elapsed: ${daysElapsed} of ${daysInMonth}
- Spent so far: ₹${Math.round(currentMonthSpent).toLocaleString('en-IN')}
- Daily spend rate: ₹${avgDaily.toLocaleString('en-IN')}/day
- Forecasted month total: ₹${totalForecast.toLocaleString('en-IN')}
- Top category: ${categories[0]?.name || 'N/A'} (3-month avg: ₹${categories[0]?.avgMonthly?.toLocaleString('en-IN') || 0}/month)

Write exactly 3 sentences:
1. Whether spending this month is on track or overpacing (compare daily rate to what would be needed to stay under ₹${totalForecast.toLocaleString('en-IN')})
2. What the top category says about their habits
3. One specific tip to save money this month

Plain text only. No markdown. Use ₹ with Indian formatting.`;

        let insight = '';
        try {
            const raw = (await aiComplete('forecast-insight', [
                { role: 'user', content: insightPrompt },
            ])).trim();
            insight = raw.replace(/```[\s\S]*?```/g, '').replace(/```/g, '').trim();
        } catch (aiErr) {
            console.error('[AI Forecast insight]', aiErr?.message);
            insight = `Your forecasted spending this month is ₹${totalForecast.toLocaleString('en-IN')} based on a daily rate of ₹${avgDaily.toLocaleString('en-IN')}.`;
        }

        const result = {
            totalForecast,
            currentMonthSpent: Math.round(currentMonthSpent),
            avgDaily,
            daysElapsed,
            daysInMonth,
            daysRemaining,
            categories,
            calendarDays,
            insight,
        };

        await setCached(pool, userId, 'forecast', result);
        res.json({ success: true, data: result, from_cache: false });
    } catch (err) {
        console.error('[AI Forecast]', err?.message || err);
        res.status(500).json({ success: false, error: 'Forecast generation failed. Try again.' });
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

        const text = (await aiComplete('health-report', [{
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
        }])).trim();
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

// ─── FEATURE: Natural Language Quick Add ─────────────────────────────
router.post('/quick-add', authMiddleware, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'Text is required' });

        const today = new Date().toISOString().split('T')[0];
        const raw = (await aiComplete('quick-add', [{
            role: 'user',
            content: `You are a financial transaction parser for an Indian personal finance app.
Parse this natural language description into a structured transaction.

Rules:
- amount: extract numeric amount only (no currency symbols)
- type: 'expense' unless the text clearly mentions salary/received/credited/earned
- category: pick the BEST match from: Food & Dining, Transportation, Shopping, Entertainment, Healthcare, Education, Utilities, Rent & Housing, Salary, Investments, Personal Care, Travel, Subscriptions, Gifts & Donations, Other
- description: short 2-4 word title (e.g. 'Coffee at Cafe', 'Uber Ride', 'Netflix Sub')
- date: today's date in YYYY-MM-DD format unless a specific date is mentioned (today is ${today})
- notes: payment mode if mentioned (UPI, cash, card, GPay, PhonePe), else empty string

Text: "${text}"

Respond with ONLY a raw JSON object. No markdown. No backticks. No explanation.
{
  "type": "expense",
  "amount": 200,
  "description": "Coffee at Cafe",
  "category": "Food & Dining",
  "date": "${today}",
  "notes": "UPI"
}`,
        }])).trim();
        const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(clean);
        res.json({ success: true, data: parsed });
    } catch (err) {
        console.error('[AI] quick-add error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to parse transaction' });
    }
});

// ─── FEATURE: Tax Estimate (Indian FY, April–March) ───────────────────
router.get('/tax-estimate', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'tax_estimate');
            if (cached) return res.json({ success: true, data: cached, from_cache: true });
        }

        // Indian financial year: April of current year to March of next year
        const now = new Date();
        const fyStart = now.getMonth() >= 3
            ? `${now.getFullYear()}-04-01`
            : `${now.getFullYear() - 1}-04-01`;
        const fyEnd = now.getMonth() >= 3
            ? `${now.getFullYear() + 1}-03-31`
            : `${now.getFullYear()}-03-31`;

        const { rows: incomeTx } = await pool.query(
            `SELECT amount, description, date,
                    COALESCE(c.name, 'Salary') as category_name
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
             WHERE t.user_id = $1 AND t.type = 'income'
               AND t.date >= $2 AND t.date <= $3
             ORDER BY t.date DESC`,
            [userId, fyStart, fyEnd]
        );

        const { rows: investmentTx } = await pool.query(
            `SELECT t.amount, t.description, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
             WHERE t.user_id = $1 AND t.type = 'expense'
               AND t.date >= $2 AND t.date <= $3
               AND LOWER(COALESCE(c.name,'')) IN ('investments','insurance','education')
             ORDER BY t.date DESC`,
            [userId, fyStart, fyEnd]
        );

        const grossIncome = incomeTx.reduce((s, t) => s + parseFloat(t.amount), 0);
        const potentialDeductions = investmentTx.reduce((s, t) => s + parseFloat(t.amount), 0);

        if (grossIncome === 0) {
            return res.json({
                success: true,
                data: {
                    grossIncome: 0,
                    estimatedTax: 0,
                    regime: 'new',
                    breakdown: [],
                    disclaimer: 'No income recorded for this financial year. Add salary/income transactions to see an estimate.',
                    fyStart, fyEnd,
                },
                from_cache: false,
            });
        }

        const context = JSON.stringify({
            financialYear: `${fyStart.slice(0, 4)}–${fyEnd.slice(0, 4)}`,
            grossIncome: Math.round(grossIncome),
            incomeBreakdown: incomeTx.slice(0, 10).map(t => ({ amount: parseFloat(t.amount), category: t.category_name })),
            potentialDeductions80C: Math.min(Math.round(potentialDeductions), 150000),
            totalInvestments: Math.round(potentialDeductions),
        });

        const raw = (await aiComplete('tax-estimate', [{
            role: 'user',
            content: `Calculate estimated Indian income tax for this user.
Compare Old Regime vs New Regime and recommend the better option.

Data: ${context}

Return ONLY valid JSON (no markdown, no backticks):
{
  "grossIncome": <number>,
  "fyPeriod": "<e.g. FY 2024-25>",
  "oldRegime": {
    "taxableIncome": <number>,
    "standardDeduction": 50000,
    "deduction80C": <number up to 150000>,
    "tax": <number>,
    "cess": <number>,
    "total": <number>
  },
  "newRegime": {
    "taxableIncome": <number>,
    "standardDeduction": 75000,
    "tax": <number>,
    "cess": <number>,
    "total": <number>
  },
  "recommendedRegime": "old" | "new",
  "savings": <amount saved by choosing recommended regime>,
  "breakdown": [
    { "slab": "<e.g. Up to ₹3L>", "rate": "<e.g. Nil>", "tax": <number> }
  ],
  "tips": ["<specific actionable tip based on their income>"],
  "disclaimer": "This is an estimate only. Consult a CA for accurate tax filing."
}`,
        }])).trim();

        const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const estimate = JSON.parse(clean);
        estimate.fyStart = fyStart;
        estimate.fyEnd = fyEnd;

        await setCached(pool, userId, 'tax_estimate', estimate);
        res.json({ success: true, data: estimate, from_cache: false });
    } catch (err) {
        console.error('[AI] tax-estimate error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ─── Aliases for spec-compliant route names ──────────────────────────
// POST /api/ai/predict → same as /api/ai/afford ("Can I afford this?")
router.post('/predict', authMiddleware, async (req, res, next) => {
    req.url = '/afford';
    router.handle(req, res, next);
});

// GET /api/ai/recurring → same as /api/ai/detect-patterns
router.get('/recurring', authMiddleware, async (req, res, next) => {
    req.url = '/detect-patterns';
    router.handle(req, res, next);
});

// ─── Salary Allocation Plan ─────────────────────────────────────────
router.post('/salary-allocation', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'salary_allocation');
            if (cached) return res.json({ ...cached, from_cache: true });
        }

        const [goalsResult, monthlyStats, salaryResult] = await Promise.all([
            pool.query(
                'SELECT name, target_amount, saved_amount, deadline FROM savings_goals WHERE user_id = $1',
                [userId]
            ),
            pool.query(`
                WITH monthly_category_totals AS (
                    SELECT
                        DATE_TRUNC('month', t.date) as month,
                        COALESCE(c.name, 'Uncategorized') as category_name,
                        t.type,
                        SUM(t.amount) as total
                    FROM transactions t
                    LEFT JOIN categories c ON c.id = t.category_id
                    WHERE t.user_id = $1
                      AND t.date >= NOW() - INTERVAL '2 months'
                    GROUP BY DATE_TRUNC('month', t.date), COALESCE(c.name, 'Uncategorized'), t.type
                    ORDER BY total DESC
                )
                SELECT month, type, category_name, total
                FROM monthly_category_totals
                LIMIT 30
            `, [userId]),
            pool.query(
                `SELECT amount FROM transactions WHERE user_id = $1 AND type = 'income' ORDER BY amount DESC LIMIT 1`,
                [userId]
            ),
        ]);

        const salaryAmount = salaryResult.rows[0]?.amount || 0;

        // Top 8 expense categories by combined total
        const categoryTotals = {};
        monthlyStats.rows.filter(r => r.type === 'expense').forEach(r => {
            categoryTotals[r.category_name] = (categoryTotals[r.category_name] || 0) + parseFloat(r.total);
        });
        const topExpenses = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, amount]) => ({ name, amount: Math.round(amount) }));

        // Monthly income/expense totals
        const monthlyTotals = {};
        monthlyStats.rows.forEach(r => {
            const m = new Date(r.month).toISOString().slice(0, 7);
            if (!monthlyTotals[m]) monthlyTotals[m] = { income: 0, expenses: 0 };
            if (r.type === 'income') monthlyTotals[m].income += parseFloat(r.total);
            else monthlyTotals[m].expenses += parseFloat(r.total);
        });

        const goalsSummary = goalsResult.rows.map(g => ({
            name: g.name,
            gap: Math.round(parseFloat(g.target_amount) - parseFloat(g.saved_amount)),
            deadline: g.deadline || null,
        }));

        const prompt = `You are a personal finance advisor for an Indian user.
Monthly salary/income: ₹${salaryAmount}

Top expense categories (last 2 months combined):
${JSON.stringify(topExpenses)}

Monthly income/expense summary:
${JSON.stringify(Object.entries(monthlyTotals).map(([month, v]) => ({ month, ...v })))}

Financial goals (gap to target):
${goalsSummary.length ? JSON.stringify(goalsSummary) : 'No goals set'}

Create a detailed monthly salary allocation plan using ALL of these frameworks together:
1. 50/30/20 rule adapted to their actual spending patterns
2. Indian financial context (EMIs, SIPs, family expenses, festivals)
3. Goal-based allocation (prioritize their stated goals)
4. Custom % based on their real category spending

Return ONLY a valid JSON object with this exact structure:
{
  "salary": <number>,
  "summary": "<2 sentence overview of their financial health>",
  "frameworks_used": ["50/30/20", "Goal-based", "Indian context", "Custom"],
  "allocation": [
    {
      "bucket": "Needs",
      "percentage": <number>,
      "amount": <number>,
      "color": "#10b981",
      "description": "<why this % for their situation>",
      "categories": [
        { "name": "Rent/EMI", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Groceries", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Utilities", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Transport", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Insurance", "recommended_amount": <number>, "last_month_actual": <number> }
      ]
    },
    {
      "bucket": "Wants",
      "percentage": <number>,
      "amount": <number>,
      "color": "#f59e0b",
      "description": "<why this % for their situation>",
      "categories": [
        { "name": "Food & Dining", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Entertainment", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Shopping", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Subscriptions", "recommended_amount": <number>, "last_month_actual": <number> }
      ]
    },
    {
      "bucket": "Savings & Investments",
      "percentage": <number>,
      "amount": <number>,
      "color": "#3b82f6",
      "description": "<why this % for their situation>",
      "categories": [
        { "name": "Emergency Fund", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "SIP/Mutual Funds", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Goal savings", "recommended_amount": <number>, "last_month_actual": <number> }
      ]
    },
    {
      "bucket": "Family & Culture",
      "percentage": <number>,
      "amount": <number>,
      "color": "#a855f7",
      "description": "Indian context — festivals, family support, gifts",
      "categories": [
        { "name": "Family Support", "recommended_amount": <number>, "last_month_actual": <number> },
        { "name": "Festivals/Events", "recommended_amount": <number>, "last_month_actual": <number> }
      ]
    }
  ],
  "insights": [
    "<specific observation about their spending vs recommendation>",
    "<goal progress insight>",
    "<one actionable tip specific to their data>"
  ],
  "month_comparison": {
    "last_month_total": <number>,
    "this_month_total": <number>,
    "trend": "improving",
    "biggest_change_category": "<category name>",
    "biggest_change_amount": <number>
  }
}

Make all amounts realistic and add up to exactly the salary amount. Use their actual spending data to personalize every number.`;

        const raw = await aiComplete('salary-allocation', [{ role: 'user', content: prompt }]);
        const clean = raw.replace(/```json|```/g, '').trim();
        const plan = JSON.parse(clean);

        await setCached(pool, userId, 'salary_allocation', plan);
        res.json({ ...plan, from_cache: false });
    } catch (err) {
        console.error('salary-allocation error:', err);
        res.status(500).json({ error: 'Failed to generate salary allocation plan.' });
    }
});

// ─── Cache-bust endpoint ─────────────────────────────────────────────
const ALLOWED_CACHE_KEYS = new Set(['forecast', 'personality', 'tax_estimate', 'salary_intelligence']);

router.delete('/cache/:key', authMiddleware, async (req, res) => {
    try {
        const { key } = req.params;
        if (!ALLOWED_CACHE_KEYS.has(key)) {
            return res.status(400).json({ error: 'Invalid cache key.' });
        }
        // PostgreSQL JSONB key deletion: ai_cache - 'key'
        await pool.query(
            `UPDATE users SET ai_cache = ai_cache - $1 WHERE id = $2`,
            [key, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[Cache delete]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
