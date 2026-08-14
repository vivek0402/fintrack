const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getVisionModel } = require('../utils/gemini');
const { aiComplete } = require('../utils/ai');
const { sendToUser, userHasTokens } = require('../utils/fcm');
const { getCached, setCached } = require('../utils/aiCache');
const { isPositiveNumber, isValidDateString } = require('../utils/validation');
const { detectSpendingSpike, detectForecastWarning } = require('./opportunities');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

        // Check cache before running any DB queries
        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'salary_intelligence');
            if (cached) return res.json({ ...cached, from_cache: true });
        }

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

// ─── FEATURE: Life Event Planning ────────────────────────────────────
router.post('/life-event', authMiddleware, async (req, res) => {
    try {
        const { event_type, target_amount, target_date } = req.body;
        if (!event_type || target_amount === undefined || !target_date)
            return res.status(400).json({ error: 'event_type, target_amount, and target_date are required.' });
        if (!isPositiveNumber(target_amount))
            return res.status(400).json({ error: 'target_amount must be greater than 0.' });
        if (!isValidDateString(target_date))
            return res.status(400).json({ error: 'target_date must be a valid date.' });

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

        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'forecast');
            if (cached) return res.json({ success: true, data: cached, from_cache: true });
        }

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

        const safeNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : Math.round(n); };

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
        const avgDaily = daysElapsed > 0 ? safeNum(currentMonthSpent / daysElapsed) : 0;

        // 4. Forecasted total = current pace projected to end of month
        const totalForecast = daysElapsed > 0 ? safeNum((currentMonthSpent / daysElapsed) * daysInMonth) : 0;

        // 5. Category breakdown — last 3 months average (display only)
        const [categoryResult, currentCategoryResult, dailyResult] = await Promise.all([
            pool.query(
                `SELECT
                   c.name AS category,
                   c.icon,
                   c.color,
                   ROUND(COALESCE(SUM(t.amount), 0) / 3.0)::float AS avg_monthly
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
            avgMonthly: safeNum(row.avg_monthly),
            spentSoFar: safeNum(spentByCategory[row.category] || 0),
            percentOfTotal: totalForecast > 0
                ? Math.round((safeNum(row.avg_monthly) / totalForecast) * 100)
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

// ─── FEATURE: Weekly Briefing ────────────────────────────────────────
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// Normalize any date to the Monday of its week (date-only, local time)
const mondayOf = (d = new Date()) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0];
};

async function getBriefingData(userId) {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const lastMonthEnd = monthStart;

    const [
        latestNW,
        weekAgoNW,
        topSpend,
        upcomingBills,
        thisMonthFlow,
        lastMonthFlow,
        topOpportunity,
        invActivity,
        prepayActivity,
    ] = await Promise.all([
        pool.query(
            `SELECT net_worth, snapshot_date FROM net_worth_snapshots
             WHERE user_id=$1 ORDER BY snapshot_date DESC LIMIT 1`,
            [userId]
        ),
        pool.query(
            `SELECT net_worth, snapshot_date FROM net_worth_snapshots
             WHERE user_id=$1 AND snapshot_date <= $2 ORDER BY snapshot_date DESC LIMIT 1`,
            [userId, weekAgo]
        ),
        pool.query(
            `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, COALESCE(SUM(t.amount),0) AS total
             FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id=$1 AND t.type='expense' AND t.date >= $2
             GROUP BY category_name ORDER BY total DESC LIMIT 1`,
            [userId, monthStart]
        ),
        pool.query(
            `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
             FROM recurring_transactions
             WHERE user_id=$1 AND is_active=true AND next_due_date BETWEEN $2 AND $3`,
            [userId, today, in7]
        ),
        pool.query(
            `SELECT
                COALESCE(SUM(amount) FILTER (WHERE type='income'),0) AS income,
                COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expense
             FROM transactions WHERE user_id=$1 AND date >= $2`,
            [userId, monthStart]
        ),
        pool.query(
            `SELECT
                COALESCE(SUM(amount) FILTER (WHERE type='income'),0) AS income,
                COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expense
             FROM transactions WHERE user_id=$1 AND date >= $2 AND date < $3`,
            [userId, lastMonthStart, lastMonthEnd]
        ),
        pool.query(
            `SELECT title, description, amount_saved, action_label, action_route
             FROM opportunities WHERE user_id=$1 AND status='active'
             ORDER BY (priority = 1) DESC, priority ASC, detected_at ASC LIMIT 1`,
            [userId]
        ),
        pool.query(
            `SELECT COUNT(*) AS cnt, COALESCE(SUM(units * price_per_unit),0) AS total
             FROM investment_transactions
             WHERE user_id=$1 AND transaction_type='buy' AND transaction_date >= $2`,
            [userId, weekAgo]
        ),
        pool.query(
            `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
             FROM loan_prepayments WHERE user_id=$1 AND prepayment_date >= $2`,
            [userId, weekAgo]
        ),
    ]);

    const netWorthNow = parseFloat(latestNW.rows[0]?.net_worth || 0);
    const netWorthBefore = parseFloat(weekAgoNW.rows[0]?.net_worth ?? netWorthNow);
    const netWorthChange = netWorthNow - netWorthBefore;

    const income = parseFloat(thisMonthFlow.rows[0]?.income || 0);
    const expense = parseFloat(thisMonthFlow.rows[0]?.expense || 0);
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

    const lastIncome = parseFloat(lastMonthFlow.rows[0]?.income || 0);
    const lastExpense = parseFloat(lastMonthFlow.rows[0]?.expense || 0);
    const lastSavingsRate = lastIncome > 0 ? ((lastIncome - lastExpense) / lastIncome) * 100 : 0;

    return {
        net_worth_this_week: { current: netWorthNow, previous: netWorthBefore, change: netWorthChange },
        top_spending_category_this_month: {
            category: topSpend.rows[0]?.category_name || null,
            total: parseFloat(topSpend.rows[0]?.total || 0),
        },
        upcoming_bills: {
            count: parseInt(upcomingBills.rows[0]?.cnt || 0),
            total: parseFloat(upcomingBills.rows[0]?.total || 0),
        },
        savings_rate_this_month: savingsRate,
        savings_rate_last_month: lastSavingsRate,
        top_opportunity: topOpportunity.rows[0] || null,
        investment_activity_this_week: {
            investment_count: parseInt(invActivity.rows[0]?.cnt || 0),
            investment_total: parseFloat(invActivity.rows[0]?.total || 0),
            prepayment_count: parseInt(prepayActivity.rows[0]?.cnt || 0),
            prepayment_total: parseFloat(prepayActivity.rows[0]?.total || 0),
        },
    };
}

function buildBriefingPoints(data) {
    const { net_worth_this_week, top_spending_category_this_month, upcoming_bills,
        savings_rate_this_month, savings_rate_last_month, top_opportunity } = data;

    const nwChange = net_worth_this_week.change;
    const nwDirection = nwChange >= 0 ? 'up' : 'down';

    const savingsDelta = savings_rate_this_month - savings_rate_last_month;
    const savingsDirection = savingsDelta >= 0 ? 'up' : 'down';

    const points = [
        {
            key: 'net_worth',
            label: 'Net Worth',
            value: inr(net_worth_this_week.current),
            insight: `${nwDirection === 'up' ? '+' : '-'}${inr(Math.abs(nwChange))} compared to last week`,
        },
        {
            key: 'top_spend',
            label: 'Top Spending Category',
            value: top_spending_category_this_month.category
                ? `${top_spending_category_this_month.category} (${inr(top_spending_category_this_month.total)})`
                : 'No expenses recorded yet',
            insight: top_spending_category_this_month.category
                ? `Your biggest spend this month went to ${top_spending_category_this_month.category}`
                : 'Log some expenses to see your spending breakdown',
        },
        {
            key: 'upcoming_bills',
            label: 'Upcoming Bills',
            value: upcoming_bills.count > 0 ? inr(upcoming_bills.total) : 'None due',
            insight: upcoming_bills.count > 0
                ? `${upcoming_bills.count} bill${upcoming_bills.count !== 1 ? 's' : ''} due in the next 7 days`
                : 'No recurring bills due in the next 7 days',
        },
        {
            key: 'savings_rate',
            label: 'Savings Rate',
            value: `${savings_rate_this_month.toFixed(1)}%`,
            insight: `${savingsDirection === 'up' ? 'Up' : 'Down'} from ${savings_rate_last_month.toFixed(1)}% last month`,
        },
        {
            key: 'opportunity',
            label: 'Top Opportunity',
            value: top_opportunity ? top_opportunity.title : 'All caught up',
            insight: top_opportunity ? top_opportunity.description : "We didn't find any new opportunities this week — keep it up!",
        },
    ];

    return points;
}

async function generateWeeklyBriefing(userId) {
    const weekOf = mondayOf();
    const data = await getBriefingData(userId);
    const points = buildBriefingPoints(data);

    const prompt = `You are a friendly financial advisor writing a short weekly briefing for an Indian personal finance app user.
Based on the following data points, write a warm, encouraging 3-4 sentence narrative summarizing their week.
Be specific and reference the numbers naturally. No markdown, no headings, no bullet points — just plain prose.

${points.map(p => `${p.label}: ${p.value} — ${p.insight}`).join('\n')}`;

    let narrative;
    try {
        narrative = (await aiComplete('briefing', [{ role: 'user', content: prompt }])).trim();
    } catch (err) {
        console.error('[Briefing] AI narrative failed:', err.message);
        narrative = `Here's your weekly money brief: your net worth is ${points[0].value} (${points[0].insight}), and your savings rate this month is ${points[3].value}.`;
    }

    const actionOfTheWeek = data.top_opportunity?.action_label
        || "You're on track this week — keep up the great work!";

    const { rows } = await pool.query(
        `INSERT INTO briefings (user_id, week_of, points, narrative, action_of_the_week)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, week_of)
         DO UPDATE SET points=$3, narrative=$4, action_of_the_week=$5
         RETURNING *`,
        [userId, weekOf, JSON.stringify(points), narrative, actionOfTheWeek]
    );

    const briefing = rows[0];

    const hasTokens = await userHasTokens(userId);
    if (hasTokens) {
        const firstSentence = narrative.split(/(?<=[.!?])\s/)[0] || narrative;
        await sendToUser(userId, {
            title: 'Your Weekly Money Brief',
            body: firstSentence,
            data: { type: 'weekly_briefing', briefing_id: briefing.id },
        });
        await pool.query(`UPDATE briefings SET push_sent_at=NOW() WHERE id=$1`, [briefing.id]);
        briefing.push_sent_at = new Date().toISOString();
    }

    return briefing;
}

// ─── FEATURE: Daily Briefing ─────────────────────────────────────────
const dateStr = (d) => d.toISOString().split('T')[0];

async function getDailyBriefData(userId) {
    const now = new Date();
    const todayStr = dateStr(now);
    const yesterday = dateStr(new Date(now.getTime() - 86400000));
    const in2days = dateStr(new Date(now.getTime() + 2 * 86400000));
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const streakWindowStart = dateStr(new Date(now.getTime() - 30 * 86400000));

    // Trend/comparison window bounds. `mondayOf` (defined above, near getBriefingData)
    // is reused here for week boundaries. The prior-week window is truncated to the
    // same number of elapsed days as the current (partial) week, not the whole week —
    // comparing a partial week to a full prior week would always make "this week"
    // look artificially smaller.
    const sameWeekdayLastWeek = dateStr(new Date(now.getTime() - 7 * 86400000));
    const currentWeekStart = mondayOf(now);
    const daysElapsedThisWeek = Math.floor((new Date(todayStr) - new Date(currentWeekStart)) / 86400000) + 1;
    const priorWeekStart = mondayOf(new Date(now.getTime() - 7 * 86400000));
    const priorWeekEnd = dateStr(new Date(new Date(priorWeekStart).getTime() + daysElapsedThisWeek * 86400000));
    const dayOfMonth = now.getDate();

    const [
        yesterdaySpend,
        yesterdayTopCat,
        todaySpend,
        billsDueSoon,
        monthExpenseSoFar,
        monthIncomeSoFar,
        spendDatesRows,
        topOpportunities,
        sameWeekdaySpend,
        weekToDateSpend,
        priorWeekSpend,
        monthlyAverageRows,
        spendingSpike,
        forecastWarning,
    ] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM transactions WHERE user_id=$1 AND type='expense' AND date=$2`, [userId, yesterday]),
        pool.query(`SELECT COALESCE(c.name,'Uncategorized') AS category_name, SUM(t.amount) AS total
                     FROM transactions t LEFT JOIN categories c ON t.category_id=c.id
                     WHERE t.user_id=$1 AND t.type='expense' AND t.date=$2
                     GROUP BY category_name ORDER BY total DESC LIMIT 1`, [userId, yesterday]),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM transactions WHERE user_id=$1 AND type='expense' AND date=$2`, [userId, todayStr]),
        pool.query(`SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM recurring_transactions
                     WHERE user_id=$1 AND is_active=true AND next_due_date BETWEEN $2 AND $3`, [userId, todayStr, in2days]),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=$1 AND type='expense' AND date >= $2 AND date < $3`, [userId, monthStart, todayStr]),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=$1 AND type='income' AND date >= $2`, [userId, monthStart]),
        // Any transaction type counts as "logged activity" for that day — a streak of
        // consistent tracking, not a streak of not spending (which would be gameable
        // by simply not logging real expenses).
        pool.query(`SELECT DISTINCT date::text AS date FROM transactions WHERE user_id=$1 AND date >= $2`, [userId, streakWindowStart]),
        // Same ranked-opportunity source the weekly briefing already reads from
        // (see getBriefingData above) -- makes the daily brief a front door into
        // the opportunities feed instead of that feed only living on its own page.
        // LIMIT 3 not 1: the partial unique index on (user_id, type) WHERE
        // status='active' guarantees these are up to 3 distinct-type opportunities.
        pool.query(
            `SELECT title, description, amount_saved, action_label, action_route, priority
             FROM opportunities WHERE user_id=$1 AND status='active'
             ORDER BY (priority = 1) DESC, priority ASC, detected_at ASC LIMIT 3`,
            [userId]
        ),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=$1 AND type='expense' AND date=$2`, [userId, sameWeekdayLastWeek]),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=$1 AND type='expense' AND date >= $2 AND date <= $3`, [userId, currentWeekStart, todayStr]),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=$1 AND type='expense' AND date >= $2 AND date < $3`, [userId, priorWeekStart, priorWeekEnd]),
        pool.query(
            `SELECT date_trunc('month', date) AS month, COALESCE(SUM(amount),0) AS total
             FROM transactions
             WHERE user_id=$1 AND type='expense'
               AND date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '3 months')
               AND date <  date_trunc('month', CURRENT_DATE)
               AND EXTRACT(DAY FROM date) <= $2
             GROUP BY month`,
            [userId, dayOfMonth]
        ),
        // Risk signals reused from the opportunities detectors, called live (not
        // read from the `opportunities` table, which is only refreshed when the
        // user visits the Opportunities page and would otherwise be stale here).
        // Both already resolve to `null` gracefully when there's nothing to flag.
        detectSpendingSpike(userId),
        detectForecastWarning(userId),
    ]);

    const loggedDates = new Set(spendDatesRows.rows.map(r => r.date));
    let streak = 0;
    for (let i = 1; i <= 30; i++) {
        const d = dateStr(new Date(now.getTime() - i * 86400000));
        if (!loggedDates.has(d)) break;
        streak++;
    }

    const income = parseFloat(monthIncomeSoFar.rows[0]?.total || 0);
    const idealDailyBudget = income > 0 ? income / daysInMonth : 0;
    const daysElapsedBeforeToday = Math.max(0, now.getDate() - 1);
    const avgDailySoFar = daysElapsedBeforeToday > 0
        ? parseFloat(monthExpenseSoFar.rows[0]?.total || 0) / daysElapsedBeforeToday
        : 0;

    const todaySoFarTotal = parseFloat(todaySpend.rows[0]?.total || 0);
    const sameWeekdayTotal = parseFloat(sameWeekdaySpend.rows[0]?.total || 0);
    const weekToDateTotal = parseFloat(weekToDateSpend.rows[0]?.total || 0);
    const priorWeekTotal = parseFloat(priorWeekSpend.rows[0]?.total || 0);
    const monthToDateTotal = parseFloat(monthExpenseSoFar.rows[0]?.total || 0);
    const monthlyAverages = monthlyAverageRows.rows.map(r => parseFloat(r.total || 0));
    const trailingMonthlyAvg = monthlyAverages.length > 0
        ? monthlyAverages.reduce((s, v) => s + v, 0) / monthlyAverages.length
        : null;

    return {
        yesterday: {
            total: parseFloat(yesterdaySpend.rows[0]?.total || 0),
            count: parseInt(yesterdaySpend.rows[0]?.cnt || 0),
            top_category: yesterdayTopCat.rows[0]?.category_name || null,
        },
        today_so_far: {
            total: todaySoFarTotal,
            count: parseInt(todaySpend.rows[0]?.cnt || 0),
        },
        bills_due_soon: {
            count: parseInt(billsDueSoon.rows[0]?.cnt || 0),
            total: parseFloat(billsDueSoon.rows[0]?.total || 0),
        },
        pace: {
            ideal_daily_budget: idealDailyBudget,
            avg_daily_so_far: avgDailySoFar,
        },
        logging_streak: streak,
        top_opportunities: topOpportunities.rows,
        comparisons: {
            vs_same_weekday_last_week: {
                current: todaySoFarTotal,
                previous: sameWeekdayTotal,
                delta: todaySoFarTotal - sameWeekdayTotal,
            },
            week_to_date_vs_prior_week: {
                current: weekToDateTotal,
                previous: priorWeekTotal,
                delta: weekToDateTotal - priorWeekTotal,
                days_elapsed: daysElapsedThisWeek,
            },
            month_to_date_vs_trailing_avg: trailingMonthlyAvg === null ? null : {
                current: monthToDateTotal,
                average: trailingMonthlyAvg,
                delta: monthToDateTotal - trailingMonthlyAvg,
                months_sampled: monthlyAverages.length,
            },
        },
        risk_flags: [spendingSpike, forecastWarning].filter(Boolean),
    };
}

// Spend comparisons: 'down' (spent less than the baseline) is the good outcome
// (rendered --color-inc on the frontend), 'up' (spent more) is the bad outcome
// (--color-exp) -- inverted from a naive "up=green" reading, per DESIGN.md's
// income/expense semantic rule. `pct` is null when there's no baseline to divide
// by (frontend renders the delta-only insight text without a % badge in that case).
const trendFor = (delta, baseline) => ({
    direction: delta > 0 ? 'up' : 'down',
    pct: baseline > 0 ? Math.round((delta / baseline) * 100) : null,
});

// Chip text needs its own plain-language phrasing -- topRisk.title/description
// are written for the Opportunities page and contain "%"/"trailing average"
// wording, which is exactly what this feature's narrative prompt was rewritten
// to avoid. Reusing them verbatim in the always-visible "Heads up" chip would
// undo that work in the most visible place on the card.
function plainRiskChip(flag) {
    if (!flag) return { value: 'Nothing urgent', insight: 'No spending or budget risks detected right now' };
    if (flag.type === 'spending_spike') {
        const category = flag.category || 'Spending';
        return {
            value: `${category} spend is higher than usual`,
            insight: `${category} spend came in higher than your usual amount this month.`,
        };
    }
    if (flag.type === 'forecast_budget_warning') {
        return {
            value: 'Trending over budget this month',
            insight: "At your current pace, you're on track to spend more than your budget this month.",
        };
    }
    // Only the two risk types above are ever produced by detectSpendingSpike/
    // detectForecastWarning today -- this fallback exists so a future new risk
    // type degrades to its raw title/description instead of crashing.
    return { value: flag.title, insight: flag.description };
}

function buildDailyBriefPoints(data) {
    const { yesterday, today_so_far, bills_due_soon, pace, logging_streak, top_opportunities, comparisons, risk_flags } = data;

    const paceDelta = pace.ideal_daily_budget > 0 ? pace.avg_daily_so_far - pace.ideal_daily_budget : null;
    const paceDirection = paceDelta === null ? null : paceDelta <= 0 ? 'under' : 'over';

    const topOpportunity = top_opportunities[0] || null;
    // Same severity priority as rankActionCandidates() below: a severe forecast
    // warning always outranks a spending spike, which outranks a moderate
    // forecast warning. Keeps the "Heads up" chip and the action-of-the-day box
    // from disagreeing about which risk is the more important one when both a
    // spike and a forecast warning are active at the same time.
    const severeForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct >= 30);
    const moderateForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct < 30);
    const spike = risk_flags.find(f => f.type === 'spending_spike');
    const topRisk = severeForecast || spike || moderateForecast || null;
    const { vs_same_weekday_last_week: sameWeekday, week_to_date_vs_prior_week: weekPace, month_to_date_vs_trailing_avg: monthTrend } = comparisons;

    const points = [
        {
            key: 'yesterday',
            label: "Yesterday's Spend",
            value: yesterday.count > 0 ? inr(yesterday.total) : 'Nothing logged',
            insight: yesterday.count > 0
                ? `Mostly on ${yesterday.top_category || 'Uncategorized'}, across ${yesterday.count} transaction${yesterday.count !== 1 ? 's' : ''}`
                : 'No expenses recorded yesterday',
        },
        {
            key: 'today',
            label: 'Today So Far',
            value: today_so_far.count > 0 ? inr(today_so_far.total) : 'Nothing yet',
            insight: today_so_far.count > 0
                ? `${today_so_far.count} transaction${today_so_far.count !== 1 ? 's' : ''} logged today`
                : 'Nothing logged today yet',
        },
        {
            key: 'bills',
            label: 'Bills Due Soon',
            value: bills_due_soon.count > 0 ? inr(bills_due_soon.total) : 'None due',
            insight: bills_due_soon.count > 0
                ? `${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due in the next 2 days`
                : 'No bills due in the next 2 days',
        },
        {
            key: 'pace',
            label: 'Pace Check',
            value: pace.ideal_daily_budget > 0 ? inr(pace.avg_daily_so_far) + '/day' : 'N/A',
            insight: paceDirection === null
                ? 'Add your income to see your ideal daily budget'
                : paceDirection === 'under'
                    ? `Running ${inr(Math.abs(paceDelta))} under your ${inr(pace.ideal_daily_budget)}/day budget`
                    : `Running ${inr(Math.abs(paceDelta))} over your ${inr(pace.ideal_daily_budget)}/day budget`,
        },
        {
            key: 'same_weekday',
            label: 'Same Day Last Week',
            value: inr(sameWeekday.current),
            insight: sameWeekday.previous > 0
                ? `${sameWeekday.delta <= 0 ? inr(Math.abs(sameWeekday.delta)) + ' less' : inr(sameWeekday.delta) + ' more'} than the same day last week (${inr(sameWeekday.previous)})`
                : 'No spending recorded on this day last week',
            trend: sameWeekday.previous > 0 ? trendFor(sameWeekday.delta, sameWeekday.previous) : null,
        },
        {
            key: 'week_pace',
            label: 'Week vs Last Week',
            value: inr(weekPace.current),
            insight: weekPace.previous > 0
                ? `${weekPace.delta <= 0 ? inr(Math.abs(weekPace.delta)) + ' less' : inr(weekPace.delta) + ' more'} than the same ${weekPace.days_elapsed} day${weekPace.days_elapsed !== 1 ? 's' : ''} last week (${inr(weekPace.previous)})`
                : 'No spending recorded in the same period last week',
            trend: weekPace.previous > 0 ? trendFor(weekPace.delta, weekPace.previous) : null,
        },
        {
            key: 'month_trend',
            label: 'Month Trend',
            value: monthTrend ? inr(monthTrend.current) : 'Not enough history',
            insight: monthTrend
                ? `${monthTrend.delta <= 0 ? inr(Math.abs(monthTrend.delta)) + ' below' : inr(monthTrend.delta) + ' above'} your trailing ${monthTrend.months_sampled}-month average (${inr(monthTrend.average)}) for this point in the month`
                : 'Need at least one full prior month of data to compare',
            trend: (monthTrend && monthTrend.average > 0) ? trendFor(monthTrend.delta, monthTrend.average) : null,
        },
        {
            key: 'risk',
            label: 'Watch For',
            value: topRisk ? topRisk.title : 'All clear',
            insight: topRisk ? topRisk.description : 'No spending or budget risks detected right now',
            // Full list, not just the top one -- kept for the unchanged-points cache
            // diff and for rankActionCandidates; the frontend only reads value/insight.
            raw: risk_flags,
        },
        {
            key: 'streak',
            label: 'Logging Streak',
            value: `${logging_streak} day${logging_streak !== 1 ? 's' : ''}`,
            insight: logging_streak > 0
                ? `${logging_streak} day${logging_streak !== 1 ? 's' : ''} of staying on top of your money — keep it going!`
                : 'Log a transaction today to start your streak',
        },
        {
            key: 'opportunity',
            label: 'Top Opportunity',
            value: topOpportunity ? topOpportunity.title : 'All caught up',
            insight: topOpportunity
                ? topOpportunity.description + (top_opportunities.length > 1 ? ` (+${top_opportunities.length - 1} more)` : '')
                : "No new opportunities right now — keep it up!",
            raw: top_opportunities,
        },
        // The two points below are what the frontend actually renders as chips
        // (see dashboard/page.tsx) -- the ten points above stay purely as
        // narrative-prompt input. Reuses paceDirection/paceDelta/topRisk already
        // computed earlier in this function; no new calculation.
        {
            key: 'today_status',
            label: 'Budget',
            value: paceDirection === null
                ? 'Add income to see your daily budget'
                : paceDirection === 'under'
                    ? `${inr(Math.abs(paceDelta))} left today`
                    : `${inr(Math.abs(paceDelta))} over today`,
            insight: paceDirection === null
                ? 'Add your income to see your ideal daily budget'
                : paceDirection === 'under'
                    ? `Running ${inr(Math.abs(paceDelta))} under your ${inr(pace.ideal_daily_budget)}/day budget`
                    : `Running ${inr(Math.abs(paceDelta))} over your ${inr(pace.ideal_daily_budget)}/day budget`,
        },
        {
            key: 'heads_up',
            label: 'Heads up',
            // Bills win over risk flags -- a due bill is a concrete near-term
            // obligation, a risk flag is a pattern observation. Risk-flag
            // wording goes through plainRiskChip() rather than topRisk.title/
            // description verbatim -- see the comment on plainRiskChip.
            value: bills_due_soon.count > 0
                ? `${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due (${inr(bills_due_soon.total)})`
                : plainRiskChip(topRisk).value,
            insight: bills_due_soon.count > 0
                ? `${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due in the next 2 days`
                : plainRiskChip(topRisk).insight,
        },
    ];

    return points;
}

// Only genuinely urgent items win a slot here -- a due bill or a real risk
// flag. Opportunities and streak nudges used to fill this box on quiet days;
// now a quiet day means this returns null and the frontend renders nothing
// (daily_briefings.action_of_the_day is nullable as of migration 065).
function rankActionCandidates(data) {
    const { bills_due_soon, risk_flags } = data;
    const severeForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct >= 30);
    const moderateForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct < 30);
    const spike = risk_flags.find(f => f.type === 'spending_spike');

    const candidates = [
        bills_due_soon.count > 0 && {
            score: 90 + Math.min(bills_due_soon.total / 1000, 10),
            message: `You have ${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due soon — make sure funds are set aside.`,
        },
        severeForecast && { score: 85, message: severeForecast.description },
        spike && { score: 70 + Math.min(spike.pct_above / 2, 15), message: spike.description },
        moderateForecast && { score: 65, message: moderateForecast.description },
    ].filter(Boolean);

    if (candidates.length === 0) return null;
    return candidates.reduce((best, c) => (c.score > best.score ? c : best)).message;
}

async function generateDailyBriefing(userId, { sendPush = true, db = pool } = {}) {
    const briefDate = dateStr(new Date());
    const data = await getDailyBriefData(userId);
    const points = buildDailyBriefPoints(data);
    const pointsJson = JSON.stringify(points);

    // Skip the LLM call entirely if nothing driving the brief has changed since
    // the last generation today (e.g. an intraday refresh for a user who hasn't
    // logged anything new) — reuse the cached narrative instead of paying for it again.
    const { rows: existingRows } = await db.query(
        `SELECT narrative, action_of_the_day, points FROM daily_briefings WHERE user_id=$1 AND brief_date=$2`,
        [userId, briefDate]
    );
    const existing = existingRows[0];
    const unchanged = existing && JSON.stringify(existing.points) === pointsJson;

    let narrative, actionOfTheDay;
    if (unchanged) {
        narrative = existing.narrative;
        actionOfTheDay = existing.action_of_the_day;
    } else {
        // Exclude the logging-streak point from the narrative prompt — it already has
        // its own chip in the UI, and the AI tends to fixate on it if given the chance.
        const narrativePoints = points.filter(p => p.key !== 'streak');

        const NARRATIVE_WORD_LIMIT = 65;

        // Labeled sections instead of one flat list, so the model can tell "raw
        // numbers" apart from "what actually matters" instead of just restating
        // every chip in prose (the original complaint this redesign addresses).
        const numberLines = narrativePoints
            .filter(p => ['yesterday', 'today', 'bills', 'pace'].includes(p.key))
            .map(p => `${p.label}: ${p.value} — ${p.insight}`).join('\n');
        const trendLines = narrativePoints
            .filter(p => ['same_weekday', 'week_pace', 'month_trend'].includes(p.key))
            .map(p => `- ${p.insight}`).join('\n');
        const watchLines = data.risk_flags.map(f => `- ${f.title}`).join('\n');
        const opportunityLine = data.top_opportunities[0]?.description || null;

        const prompt = `You are texting a friend a quick, warm update about their spending today -- not writing a financial report.
Based on the sections below, write 2-3 short sentences about their day.
Weave together at most one TRENDS item and one WATCH FOR item into a single connected observation -- do not enumerate every input.
If WATCH FOR is empty, find something in TRENDS to praise instead of inventing a problem.

Plain-language rules -- follow these strictly:
- At most ONE number per sentence. If a sentence would need two numbers, cut it to the one that matters most.
- Never use "%", "vs.", "trailing average", or "N-month average" -- say "more than usual" or "your usual rent" instead of the exact percentage.
- Never use analyst phrasing: no "echoing", no "same N-day stretch", no semicolons, no clause-stacking.
- Round rupee amounts to whole numbers in prose (₹938, not ₹938.00).
- Write like you're telling a friend, not summarizing a dashboard.

No markdown, no headings, no bullet points in your reply — just plain prose.
Do not mention logging streaks, habits, or consistency — focus only on the spending, bill, and trend data below.
Keep it to ${NARRATIVE_WORD_LIMIT} words or fewer.

TODAY'S NUMBERS:
${numberLines}

TRENDS:
${trendLines}
${watchLines ? `\nWATCH FOR:\n${watchLines}` : ''}
${opportunityLine ? `\nOPPORTUNITY:\n${opportunityLine}` : ''}

Reminder: keep your reply to ${NARRATIVE_WORD_LIMIT} words or fewer, at most one number per sentence, no percentages.`;

        try {
            narrative = (await aiComplete('daily-briefing', [{ role: 'user', content: prompt }])).trim();
        } catch (err) {
            console.error('[DailyBrief] AI narrative failed:', err.message);
            narrative = `Here's your daily brief: ${points[0].label.toLowerCase()} was ${points[0].value}, and today so far you've spent ${points[1].value}.`;
        }

        // Hard backstop — truncate if the model ignores the word-limit instruction
        const words = narrative.split(/\s+/).filter(Boolean);
        if (words.length > NARRATIVE_WORD_LIMIT) {
            narrative = words.slice(0, NARRATIVE_WORD_LIMIT).join(' ').replace(/[,;:]?$/, '') + '…';
        }

        actionOfTheDay = rankActionCandidates(data);
    }

    const { rows } = await db.query(
        `INSERT INTO daily_briefings (user_id, brief_date, points, narrative, action_of_the_day, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, brief_date)
         DO UPDATE SET points=$3, narrative=$4, action_of_the_day=$5, updated_at=NOW()
         RETURNING *`,
        [userId, briefDate, pointsJson, narrative, actionOfTheDay]
    );

    const briefing = rows[0];

    const hasTokens = sendPush && await userHasTokens(userId);
    if (hasTokens) {
        const firstSentence = narrative.split(/(?<=[.!?])\s/)[0] || narrative;
        await sendToUser(userId, {
            title: 'Your Daily Money Brief',
            body: firstSentence,
            data: { type: 'daily_briefing', briefing_id: briefing.id },
        });
        await db.query(`UPDATE daily_briefings SET push_sent_at=NOW() WHERE id=$1`, [briefing.id]);
        briefing.push_sent_at = new Date().toISOString();
    }

    return briefing;
}

// POST /briefing/generate — idempotent, regenerates this week's briefing
router.post('/briefing/generate', authMiddleware, async (req, res) => {
    try {
        const briefing = await generateWeeklyBriefing(req.user.id);
        res.json(briefing);
    } catch (err) {
        console.error('[Briefing] generate error:', err);
        res.status(500).json({ error: 'Failed to generate weekly briefing.' });
    }
});

// GET /briefing/latest — most recent briefing
router.get('/briefing/latest', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM briefings WHERE user_id=$1 ORDER BY week_of DESC LIMIT 1`,
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'No briefing found.' });

        let briefing = rows[0];
        if (!briefing.opened_at) {
            const updated = await pool.query(
                `UPDATE briefings SET opened_at=NOW() WHERE id=$1 RETURNING *`,
                [briefing.id]
            );
            briefing = updated.rows[0];
        }
        res.json(briefing);
    } catch (err) {
        console.error('[Briefing] latest error:', err);
        res.status(500).json({ error: 'Failed to fetch latest briefing.' });
    }
});

// GET /briefing/history — last 12 briefings (summary only)
router.get('/briefing/history', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, week_of, action_of_the_week, opened_at FROM briefings
             WHERE user_id=$1 ORDER BY week_of DESC LIMIT 12`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[Briefing] history error:', err);
        res.status(500).json({ error: 'Failed to fetch briefing history.' });
    }
});

// POST /briefing/daily/generate — manual refresh, rate-limited to 2/minute (sliding window)
const DAILY_BRIEF_REFRESH_WINDOW_MS = 60 * 1000;
const DAILY_BRIEF_REFRESH_MAX = 2;

router.post('/briefing/daily/generate', authMiddleware, async (req, res) => {
    // The original read-then-write on refresh_log raced under concurrent refresh
    // clicks (same shape as the aiCache.js bug): two requests could both read the
    // same recentRefreshes, both pass the rate-limit check, and both write back
    // a log missing the other's timestamp. SELECT ... FOR UPDATE serializes
    // concurrent requests for the same (user_id, brief_date) row so the second
    // request sees the first's committed refresh_log before deciding.
    const client = await pool.connect();
    try {
        const today = dateStr(new Date());
        await client.query('BEGIN');

        const { rows: existing } = await client.query(
            `SELECT refresh_log FROM daily_briefings WHERE user_id=$1 AND brief_date=$2 FOR UPDATE`,
            [req.user.id, today]
        );
        const now = Date.now();
        const recentRefreshes = (existing[0]?.refresh_log || [])
            .map(t => new Date(t).getTime())
            .filter(t => now - t < DAILY_BRIEF_REFRESH_WINDOW_MS)
            .sort((a, b) => a - b);

        if (recentRefreshes.length >= DAILY_BRIEF_REFRESH_MAX) {
            await client.query('ROLLBACK');
            const waitSec = Math.ceil((DAILY_BRIEF_REFRESH_WINDOW_MS - (now - recentRefreshes[0])) / 1000);
            return res.status(429).json({ error: 'Please wait before refreshing again.', wait: waitSec });
        }

        const briefing = await generateDailyBriefing(req.user.id, { db: client });

        const updatedLog = [...recentRefreshes, now].map(t => new Date(t).toISOString());
        await client.query(
            `UPDATE daily_briefings SET refresh_log=$1 WHERE user_id=$2 AND brief_date=$3`,
            [updatedLog, req.user.id, today]
        );
        await client.query('COMMIT');

        res.json(briefing);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[DailyBrief] generate error:', err);
        res.status(500).json({ error: 'Failed to generate daily briefing.' });
    } finally {
        client.release();
    }
});

// GET /briefing/daily/latest — today's briefing, auto-generates if missing
router.get('/briefing/daily/latest', authMiddleware, async (req, res) => {
    try {
        const today = dateStr(new Date());
        const { rows } = await pool.query(
            `SELECT * FROM daily_briefings WHERE user_id=$1 AND brief_date=$2`,
            [req.user.id, today]
        );

        let briefing = rows[0];
        if (!briefing) {
            briefing = await generateDailyBriefing(req.user.id);
        } else if (!briefing.opened_at) {
            const updated = await pool.query(
                `UPDATE daily_briefings SET opened_at=NOW() WHERE id=$1 RETURNING *`,
                [briefing.id]
            );
            briefing = updated.rows[0];
        }
        res.json(briefing);
    } catch (err) {
        console.error('[DailyBrief] latest error:', err);
        res.status(500).json({ error: 'Failed to fetch daily briefing.' });
    }
});

// ─── Cache-bust endpoint ─────────────────────────────────────────────
const ALLOWED_CACHE_KEYS = new Set(['forecast', 'personality', 'salary_intelligence', 'behavioral_patterns']);

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
module.exports.generateWeeklyBriefing = generateWeeklyBriefing;
module.exports.mondayOf = mondayOf;
module.exports.generateDailyBriefing = generateDailyBriefing;
module.exports.rankActionCandidates = rankActionCandidates;
module.exports.buildDailyBriefPoints = buildDailyBriefPoints;
