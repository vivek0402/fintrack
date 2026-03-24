const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getModel } = require('../utils/gemini');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── FEATURE 4: Parse SMS ───────────────────────────────────────────
router.post('/parse-sms', authMiddleware, async (req, res) => {
    try {
        const { sms } = req.body;
        if (!sms) return res.status(400).json({ error: 'SMS text is required' });

        const model = getModel();
        const result = await model.generateContent(
            `Extract transaction details from this Indian bank SMS. Return ONLY valid JSON with these fields (no markdown, no explanation):
{
  "amount": number,
  "type": "income" or "expense",
  "description": string,
  "date": "YYYY-MM-DD",
  "merchant": string
}
If you cannot extract a field, use null. SMS: ${sms}`
        );

        const text = result.response.text().trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json({ parsed });
    } catch (err) {
        console.error('AI parse-sms error:', err.message);
        res.json({ parsed: null, error: 'Could not parse the SMS. Please enter details manually.' });
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

        const model = getModel();
        const result = await model.generateContent(
            `You are a friendly personal finance advisor. Based on this month's data, write a 3-4 sentence summary in plain English. Be specific with numbers. Mention what went well and what to watch out for. Keep it conversational, not robotic. Use ₹ for amounts. Data: ${context}`
        );

        res.json({ report: result.response.text().trim() });
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

        const model = getModel();
        const result = await model.generateContent(
            `The user is asking: "${query}"
Based on their financial data below, give a direct yes/no recommendation on whether they can afford it, and explain why in 2-3 sentences. Consider their current savings rate, budget status, and active goals. Be honest but encouraging. Use ₹ for amounts.
Also include a "sentiment" field in your response: "positive", "cautious", or "negative".
Return ONLY valid JSON (no markdown): { "recommendation": "your recommendation text", "sentiment": "positive" | "cautious" | "negative" }
Financial data: ${context}`
        );

        const text = result.response.text().trim();
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json(parsed);
    } catch (err) {
        console.error('AI afford error:', err.message);
        res.json({ recommendation: 'Unable to analyse right now. Please try again in a moment.', sentiment: 'cautious' });
    }
});

// ─── FEATURE 2: AI Chat ────────────────────────────────────────────
router.post('/chat', authMiddleware, async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const userId = req.user.id;

        const [txRes, budgetRes, goalRes] = await Promise.all([
            pool.query(
                `SELECT t.*, c.name as category_name FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.date >= NOW() - INTERVAL '3 months'
                 ORDER BY t.date DESC`,
                [userId]
            ),
            pool.query(`SELECT b.*, c.name as category_name FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.user_id = $1`, [userId]),
            pool.query(`SELECT * FROM savings_goals WHERE user_id = $1`, [userId]),
        ]);

        const context = JSON.stringify({
            transactions: txRes.rows.map(t => ({ date: t.date, type: t.type, amount: parseFloat(t.amount), description: t.description, category: t.category_name })),
            budgets: budgetRes.rows.map(b => ({ category: b.category_name, amount: parseFloat(b.amount), month: b.month, year: b.year })),
            goals: goalRes.rows.map(g => ({ name: g.name, target: parseFloat(g.target_amount), saved: parseFloat(g.saved_amount), deadline: g.deadline })),
        });

        const systemPrompt = `You are a helpful personal finance advisor for FinTrack. You have access to the user's financial data below. Answer questions specifically using their data. Be concise, friendly, and use Indian Rupee (₹) formatting. Never make up numbers — only use what's in the data provided.\nUser's financial data: ${context}`;

        const model = getModel();
        const chatHistory = (history || []).map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }],
        }));

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: 'I understand. I have access to your financial data and I\'m ready to help you with your personal finance questions. What would you like to know?' }] },
                ...chatHistory,
            ],
        });

        const result = await chat.sendMessage(message);
        res.json({ reply: result.response.text().trim() });
    } catch (err) {
        console.error('AI chat error:', err.message);
        res.json({ reply: 'I\'m having trouble connecting right now. Please try again in a moment.' });
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

        const model = getModel();
        const result = await model.generateContent(
            `Analyse these transactions and identify any that appear to be recurring (same merchant, similar amount, repeating monthly or weekly). Exclude transactions already in the recurring list provided.
Return ONLY valid JSON array (no markdown):
[{ "description": string, "amount": number, "frequency": "monthly" or "weekly", "merchant": string, "confidence": "high" or "medium" }]
If none found, return an empty array [].
Transactions: ${JSON.stringify(transactions)}
Existing recurring: ${JSON.stringify(existing)}`
        );

        const text = result.response.text().trim();
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

        const model = getModel();
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

        const model = getModel();
        const result = await model.generateContent(
            `Parse this expense split description and return ONLY valid JSON (no markdown):
{
  "description": string,
  "total_amount": number,
  "split_count": number,
  "participants": [{ "name": string }]
}
If you cannot extract a field, use null. Text: ${text}`
        );

        const responseText = result.response.text().trim();
        const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        res.json({ parsed });
    } catch (err) {
        console.error('AI parse-split error:', err.message);
        res.json({ parsed: null, error: 'Could not parse. Please enter details manually.' });
    }
});

module.exports = router;
