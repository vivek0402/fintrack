const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { fetchTotalCreditCardOutstanding } = require('../utils/creditCardBalance');
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
       AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`,
            [req.user.id, m, y]
        );
        const expenseRes = await pool.query(
            `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
       WHERE user_id=$1 AND type='expense'
       AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3
       AND NOT EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true)
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`,
            [req.user.id, m, y]
        );
        const categoryRes = await pool.query(
            `SELECT c.name, c.color, c.icon, COALESCE(SUM(t.amount),0) AS total
       FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id=$1 AND t.type='expense' AND c.is_investment_category = false
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
       AND NOT (type = 'expense' AND EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true))
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
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
       AND NOT (type = 'expense' AND EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true))
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
       GROUP BY year, month, type ORDER BY year ASC, month ASC`,
            [req.user.id, currentYear, lastYear]
        );
        const totals = await pool.query(
            `SELECT EXTRACT(YEAR FROM date) AS year, type, SUM(amount) AS total
       FROM transactions WHERE user_id=$1 AND EXTRACT(YEAR FROM date) IN ($2,$3)
       AND NOT (type = 'expense' AND EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true))
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
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
       AND NOT (type = 'expense' AND EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true))
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
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
       WHERE user_id=$1 AND date >= $2 AND date <= $3
       AND NOT (type = 'expense' AND EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true))
       AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
       GROUP BY type`,
            [req.user.id, from, to]
        );
        const categoryResult = await pool.query(
            `SELECT c.name, c.color, SUM(t.amount) AS total
       FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id=$1 AND t.type='expense' AND c.is_investment_category = false AND t.date >= $2 AND t.date <= $3
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

router.get('/payment-methods', async (req, res) => {
    try {
        const { month, year } = req.query;
        const m = month || new Date().getMonth() + 1;
        const y = year || new Date().getFullYear();

        const result = await pool.query(
            `SELECT COALESCE(payment_method, 'Cash') AS method,
                    COUNT(*)::int AS count,
                    COALESCE(SUM(amount), 0)::float AS total
             FROM transactions
             WHERE user_id = $1 AND type = 'expense'
               AND EXTRACT(MONTH FROM date) = $2
               AND EXTRACT(YEAR FROM date) = $3
               AND NOT EXISTS (SELECT 1 FROM categories cat WHERE cat.id = transactions.category_id AND cat.is_investment_category = true)
               AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
             GROUP BY method
             ORDER BY total DESC`,
            [req.user.id, m, y]
        );

        const grandTotal = result.rows.reduce((s, r) => s + r.total, 0);
        const breakdown = result.rows.map(r => ({
            method: r.method,
            count: r.count,
            total: r.total,
            percent: grandTotal > 0 ? parseFloat(((r.total / grandTotal) * 100).toFixed(1)) : 0,
        }));

        res.json({ breakdown, total: grandTotal, month: m, year: y });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/networth', async (req, res) => {
    try {
        const [bankRes, investRes, total_credit_outstanding, loanRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(SUM(
                    COALESCE(a.starting_balance, 0)
                    + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'income' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
                    - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'expense' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
                 ), 0) AS total
                 FROM bank_accounts a WHERE a.user_id = $1`,
                [req.user.id]
            ),
            pool.query(
                `SELECT COALESCE(SUM(units * current_nav_or_price), 0) AS total FROM investments WHERE user_id = $1`,
                [req.user.id]
            ),
            fetchTotalCreditCardOutstanding(pool, req.user.id),
            pool.query(
                `SELECT COALESCE(SUM(outstanding_balance), 0) AS total FROM loans WHERE user_id = $1 AND is_active = true`,
                [req.user.id]
            ),
        ]);

        const total_bank_balance = parseFloat(bankRes.rows[0].total);
        const total_investments = parseFloat(investRes.rows[0].total);
        const total_loans_outstanding = parseFloat(loanRes.rows[0].total);

        const total_assets = total_bank_balance + total_investments;
        const total_liabilities = total_credit_outstanding + total_loans_outstanding;
        const net_worth = total_assets - total_liabilities;

        await pool.query(
            `INSERT INTO net_worth_snapshots
               (user_id, snapshot_date, total_bank_balance, total_investments, total_assets,
                total_credit_outstanding, total_loans_outstanding, total_liabilities, net_worth)
             VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (user_id, snapshot_date)
             DO UPDATE SET
               total_bank_balance = EXCLUDED.total_bank_balance,
               total_investments = EXCLUDED.total_investments,
               total_assets = EXCLUDED.total_assets,
               total_credit_outstanding = EXCLUDED.total_credit_outstanding,
               total_liabilities = EXCLUDED.total_liabilities,
               net_worth = EXCLUDED.net_worth`,
            [req.user.id, total_bank_balance, total_investments, total_assets, total_credit_outstanding, total_loans_outstanding, total_liabilities, net_worth]
        );

        const historyRes = await pool.query(
            `SELECT snapshot_date, net_worth, total_assets, total_liabilities
             FROM net_worth_snapshots
             WHERE user_id = $1
             ORDER BY snapshot_date ASC
             LIMIT 12`,
            [req.user.id]
        );

        res.json({
            current: {
                total_bank_balance,
                total_investments,
                total_assets,
                total_credit_outstanding,
                total_loans_outstanding,
                total_liabilities,
                net_worth,
            },
            history: historyRes.rows,
        });
    } catch (err) {
        console.error('[Analytics]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/investment-ratio', async (req, res) => {
    try {
        const [incomeRes, investedRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
                 WHERE user_id = $1 AND type = 'income'
                 AND date >= date_trunc('month', CURRENT_DATE)`,
                [req.user.id]
            ),
            pool.query(
                `SELECT COALESCE(SUM(it.units * it.price_per_unit), 0) AS total
                 FROM investment_transactions it
                 WHERE it.user_id = $1 AND it.transaction_type = 'buy'
                 AND it.transaction_date >= date_trunc('month', CURRENT_DATE)`,
                [req.user.id]
            ),
        ]);

        const income_this_month = parseFloat(incomeRes.rows[0].total);
        const invested_this_month = parseFloat(investedRes.rows[0].total);
        const ratio_pct = income_this_month > 0
            ? parseFloat(((invested_this_month / income_this_month) * 100).toFixed(1))
            : 0;

        res.json({ invested_this_month, income_this_month, ratio_pct });
    } catch (err) {
        console.error('[Analytics]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/wealth-velocity', async (req, res) => {
    try {
        const snapsRes = await pool.query(
            `SELECT snapshot_date, net_worth
             FROM net_worth_snapshots
             WHERE user_id = $1
             ORDER BY snapshot_date ASC
             LIMIT 8`,
            [req.user.id]
        );

        const snapshots = snapsRes.rows.map(r => ({
            snapshot_date: r.snapshot_date,
            net_worth: parseFloat(r.net_worth),
        }));

        if (snapshots.length < 2) {
            return res.json({
                snapshots,
                mom_changes: [],
                avg_monthly_growth: 0,
                avg_monthly_growth_pct: 0,
                trend: 'insufficient_data',
                message: 'Track your finances for at least 2 months to see wealth velocity',
            });
        }

        const mom_changes = [];
        for (let i = 1; i < snapshots.length; i++) {
            const prev = snapshots[i - 1];
            const curr = snapshots[i];
            const absolute_change = curr.net_worth - prev.net_worth;
            const pct_change = prev.net_worth !== 0
                ? (absolute_change / Math.abs(prev.net_worth)) * 100
                : 0;
            mom_changes.push({
                from_date: prev.snapshot_date,
                to_date: curr.snapshot_date,
                absolute_change,
                pct_change: parseFloat(pct_change.toFixed(2)),
            });
        }

        const avg_monthly_growth = mom_changes.reduce((sum, c) => sum + c.absolute_change, 0) / mom_changes.length;
        const avg_monthly_growth_pct = parseFloat(
            (mom_changes.reduce((sum, c) => sum + c.pct_change, 0) / mom_changes.length).toFixed(2)
        );

        let trend = 'insufficient_data';
        if (snapshots.length >= 6) {
            const last3 = mom_changes.slice(-3);
            const prev3 = mom_changes.slice(-6, -3);
            const recentAvg = last3.reduce((s, c) => s + c.absolute_change, 0) / last3.length;
            const previousAvg = prev3.reduce((s, c) => s + c.absolute_change, 0) / prev3.length;

            if (previousAvg !== 0 && recentAvg > previousAvg * 1.05) trend = 'accelerating';
            else if (previousAvg !== 0 && recentAvg < previousAvg * 0.95) trend = 'decelerating';
            else trend = 'steady';
        }

        res.json({
            snapshots,
            mom_changes,
            avg_monthly_growth,
            avg_monthly_growth_pct,
            trend,
        });
    } catch (err) {
        console.error('[Analytics]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/asset-allocation', async (req, res) => {
    try {
        const [bankRes, invRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(SUM(
                    COALESCE(a.starting_balance, 0)
                    + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'income' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
                    - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'expense' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
                 ), 0) AS total
                 FROM bank_accounts a WHERE a.user_id = $1`,
                [req.user.id]
            ),
            pool.query(
                `SELECT type, COALESCE(SUM(units * current_nav_or_price), 0) AS total
                 FROM investments WHERE user_id = $1
                 GROUP BY type`,
                [req.user.id]
            ),
        ]);

        const invTotals = {};
        for (const row of invRes.rows) {
            invTotals[row.type] = parseFloat(row.total);
        }

        const categories = {
            bank: parseFloat(bankRes.rows[0].total),
            mutual_fund: invTotals.mutual_fund || 0,
            stock: invTotals.stock || 0,
            fd: invTotals.fd || 0,
            ppf: invTotals.ppf || 0,
            nps: invTotals.nps || 0,
            gold: invTotals.gold || 0,
            crypto: invTotals.crypto || 0,
            other: invTotals.other || 0,
        };

        const total_assets = Object.values(categories).reduce((sum, v) => sum + v, 0);

        const recommended_pct = {
            bank: 10,
            mutual_fund: 30,
            stock: 30,
            fd: 8.33,
            ppf: 8.33,
            nps: 8.34,
            gold: 5,
            crypto: 0,
            other: 0,
        };

        const labels = {
            bank: 'Bank Balance',
            mutual_fund: 'Mutual Funds',
            stock: 'Stocks',
            fd: 'Fixed Deposits',
            ppf: 'PPF',
            nps: 'NPS',
            gold: 'Gold',
            crypto: 'Crypto',
            other: 'Other',
        };

        const allocations = Object.keys(categories).map(category => {
            const amount = categories[category];
            const actual_pct = total_assets > 0
                ? parseFloat(((amount / total_assets) * 100).toFixed(1))
                : 0;
            const rec_pct = recommended_pct[category];
            return {
                category,
                label: labels[category],
                amount,
                actual_pct,
                recommended_pct: rec_pct,
                deviation: parseFloat((actual_pct - rec_pct).toFixed(1)),
            };
        });

        const deviation_score = total_assets > 0
            ? parseFloat((allocations.reduce((sum, a) => sum + Math.abs(a.deviation), 0) / allocations.length).toFixed(1))
            : 0;

        res.json({
            allocations,
            total_assets,
            deviation_score,
            recommendation_note: 'Based on a 60/25/5/10 equity-debt-gold-cash model',
        });
    } catch (err) {
        console.error('[Analytics]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;