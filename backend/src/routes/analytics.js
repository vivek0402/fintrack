const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/summary', async (req, res) => {
    try {
        const { month, year } = req.query;
        const m = month || new Date().getMonth() + 1;
        const y = year || new Date().getFullYear();

        const incomeRes = await pool.query(
            `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
       WHERE user_id=$1 AND type='income'
       AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3`,
            [req.user.id, m, y]
        );
        const expenseRes = await pool.query(
            `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
       WHERE user_id=$1 AND type='expense'
       AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3`,
            [req.user.id, m, y]
        );
        const categoryRes = await pool.query(
            `SELECT c.name, c.color, c.icon, COALESCE(SUM(t.amount),0) AS total
       FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id=$1 AND t.type='expense'
       AND EXTRACT(MONTH FROM t.date)=$2 AND EXTRACT(YEAR FROM t.date)=$3
       GROUP BY c.id, c.name, c.color, c.icon ORDER BY total DESC`,
            [req.user.id, m, y]
        );

        const totalIncome = parseFloat(incomeRes.rows[0].total);
        const totalExpense = parseFloat(expenseRes.rows[0].total);
        const balance = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : 0;

        res.json({
            summary: { total_income: totalIncome, total_expenses: totalExpense, balance, savings_rate: parseFloat(savingsRate), month: m, year: y },
            category_breakdown: categoryRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/trends', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT EXTRACT(YEAR FROM date) AS year, EXTRACT(MONTH FROM date) AS month,
              type, SUM(amount) AS total
       FROM transactions WHERE user_id=$1 AND date >= NOW() - INTERVAL '6 months'
       GROUP BY year, month, type ORDER BY year ASC, month ASC`,
            [req.user.id]
        );
        res.json({ trends: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/yearly', async (req, res) => {
    try {
        const currentYear = parseInt(req.query.year) || new Date().getFullYear();
        const lastYear = currentYear - 1;

        const monthly = await pool.query(
            `SELECT EXTRACT(YEAR FROM date) AS year, EXTRACT(MONTH FROM date) AS month,
              type, SUM(amount) AS total
       FROM transactions WHERE user_id=$1 AND EXTRACT(YEAR FROM date) IN ($2,$3)
       GROUP BY year, month, type ORDER BY year ASC, month ASC`,
            [req.user.id, currentYear, lastYear]
        );
        const totals = await pool.query(
            `SELECT EXTRACT(YEAR FROM date) AS year, type, SUM(amount) AS total
       FROM transactions WHERE user_id=$1 AND EXTRACT(YEAR FROM date) IN ($2,$3)
       GROUP BY year, type ORDER BY year ASC`,
            [req.user.id, currentYear, lastYear]
        );

        res.json({ monthly: monthly.rows, totals: totals.rows, years: { current: currentYear, last: lastYear } });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/forecast', async (req, res) => {
    try {
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const today = new Date();
        const daysInMonth = new Date(year, month, 0).getDate();
        const dayOfMonth = today.getMonth() + 1 === month && today.getFullYear() === year
            ? today.getDate() : daysInMonth;

        const result = await pool.query(
            `SELECT type, SUM(amount) AS total FROM transactions
       WHERE user_id=$1 AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3
       GROUP BY type`,
            [req.user.id, month, year]
        );

        let income = 0, expenses = 0;
        result.rows.forEach(r => {
            if (r.type === 'income') income = parseFloat(r.total);
            if (r.type === 'expense') expenses = parseFloat(r.total);
        });

        const dailyRate = dayOfMonth > 0 ? expenses / dayOfMonth : 0;
        const projectedExpenses = dailyRate * daysInMonth;
        const projectedSavings = income - projectedExpenses;

        res.json({
            forecast: {
                income, expenses_so_far: expenses,
                projected_expenses: projectedExpenses,
                projected_savings: projectedSavings,
                daily_rate: dailyRate,
                ideal_daily_budget: income > 0 ? income / daysInMonth : 0,
                day_of_month: dayOfMonth,
                days_in_month: daysInMonth,
                days_remaining: daysInMonth - dayOfMonth,
                is_on_track: projectedExpenses <= income,
                savings_rate: income > 0 ? ((income - projectedExpenses) / income * 100).toFixed(1) : 0,
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/report', async (req, res) => {
    try {
        const { from, to } = req.query;
        if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });

        const txResult = await pool.query(
            `SELECT t.*, c.name AS category_name, c.color AS category_color
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id=$1 AND t.date >= $2 AND t.date <= $3
       ORDER BY t.date DESC`,
            [req.user.id, from, to]
        );
        const summaryResult = await pool.query(
            `SELECT type, SUM(amount) AS total FROM transactions
       WHERE user_id=$1 AND date >= $2 AND date <= $3 GROUP BY type`,
            [req.user.id, from, to]
        );
        const categoryResult = await pool.query(
            `SELECT c.name, c.color, SUM(t.amount) AS total
       FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id=$1 AND t.type='expense' AND t.date >= $2 AND t.date <= $3
       GROUP BY c.id, c.name, c.color ORDER BY total DESC`,
            [req.user.id, from, to]
        );

        let income = 0, expenses = 0;
        summaryResult.rows.forEach(r => {
            if (r.type === 'income') income = parseFloat(r.total);
            if (r.type === 'expense') expenses = parseFloat(r.total);
        });

        res.json({
            transactions: txResult.rows,
            summary: { income, expenses, balance: income - expenses, savings_rate: income > 0 ? ((income - expenses) / income * 100).toFixed(1) : 0, transaction_count: txResult.rows.length },
            categories: categoryResult.rows,
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;