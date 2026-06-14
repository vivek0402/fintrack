const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber, isNonNegativeNumber, isValidDateString, isValidInvestmentType } = require('../utils/validation');
const router = express.Router();

router.use(auth);

function withComputedFields(row) {
    const units = parseFloat(row.units);
    const purchasePrice = parseFloat(row.purchase_price_per_unit);
    const currentPrice = parseFloat(row.current_nav_or_price);

    const current_value = units * currentPrice;
    const total_invested = units * purchasePrice;
    const unrealized_gain = current_value - total_invested;
    const unrealized_gain_pct = total_invested > 0
        ? parseFloat(((unrealized_gain / total_invested) * 100).toFixed(2))
        : 0;

    return {
        ...row,
        current_value,
        total_invested,
        unrealized_gain,
        unrealized_gain_pct,
    };
}

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM investments WHERE user_id = $1',
            [req.user.id]
        );
        const investments = result.rows
            .map(withComputedFields)
            .sort((a, b) => b.current_value - a.current_value);
        res.json({ investments });
    } catch (err) {
        console.error('[Investments]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM investments WHERE user_id = $1',
            [req.user.id]
        );
        const investments = result.rows.map(withComputedFields);

        const total_invested = investments.reduce((s, r) => s + r.total_invested, 0);
        const total_current_value = investments.reduce((s, r) => s + r.current_value, 0);
        const total_unrealized_gain = total_current_value - total_invested;
        const total_unrealized_gain_pct = total_invested > 0
            ? parseFloat(((total_unrealized_gain / total_invested) * 100).toFixed(2))
            : 0;

        const byTypeMap = new Map();
        for (const inv of investments) {
            if (!byTypeMap.has(inv.type)) {
                byTypeMap.set(inv.type, { type: inv.type, count: 0, total_invested: 0, total_current_value: 0 });
            }
            const entry = byTypeMap.get(inv.type);
            entry.count += 1;
            entry.total_invested += inv.total_invested;
            entry.total_current_value += inv.current_value;
        }
        const by_type = Array.from(byTypeMap.values()).map(entry => ({
            ...entry,
            unrealized_gain_pct: entry.total_invested > 0
                ? parseFloat((((entry.total_current_value - entry.total_invested) / entry.total_invested) * 100).toFixed(2))
                : 0,
        }));

        const top_holdings = [...investments]
            .sort((a, b) => b.current_value - a.current_value)
            .slice(0, 5)
            .map(inv => ({
                id: inv.id,
                name: inv.name,
                type: inv.type,
                current_value: inv.current_value,
                unrealized_gain_pct: inv.unrealized_gain_pct,
            }));

        res.json({
            total_invested,
            total_current_value,
            total_unrealized_gain,
            total_unrealized_gain_pct,
            by_type,
            top_holdings,
        });
    } catch (err) {
        console.error('[Investments]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { type, name, ticker_or_folio, units, purchase_price_per_unit, current_nav_or_price, purchase_date, account_label, notes } = req.body;

        if (!type || !name || units === undefined || purchase_price_per_unit === undefined || current_nav_or_price === undefined || !purchase_date)
            return res.status(400).json({ error: 'type, name, units, purchase_price_per_unit, current_nav_or_price and purchase_date are required.' });
        if (!isValidInvestmentType(type))
            return res.status(400).json({ error: 'Invalid investment type.' });
        if (!isPositiveNumber(units))
            return res.status(400).json({ error: 'units must be greater than 0.' });
        if (!isNonNegativeNumber(purchase_price_per_unit))
            return res.status(400).json({ error: 'purchase_price_per_unit must be 0 or greater.' });
        if (!isNonNegativeNumber(current_nav_or_price))
            return res.status(400).json({ error: 'current_nav_or_price must be 0 or greater.' });
        if (!isValidDateString(purchase_date))
            return res.status(400).json({ error: 'purchase_date must be a valid date (YYYY-MM-DD).' });
        if (new Date(purchase_date) > new Date())
            return res.status(400).json({ error: 'purchase_date cannot be in the future.' });

        const result = await pool.query(
            `INSERT INTO investments (user_id, type, name, ticker_or_folio, units, purchase_price_per_unit, current_nav_or_price, purchase_date, account_label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [req.user.id, type, name, ticker_or_folio || null, units, purchase_price_per_unit, current_nav_or_price, purchase_date, account_label || null, notes || null]
        );
        res.status(201).json({ investment: withComputedFields(result.rows[0]) });
    } catch (err) {
        console.error('[Investments]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const existing = await pool.query(
            'SELECT id, user_id FROM investments WHERE id = $1',
            [req.params.id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Investment not found.' });
        if (existing.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const { current_nav_or_price, units, name, account_label, notes } = req.body;
        if (current_nav_or_price !== undefined && !isNonNegativeNumber(current_nav_or_price))
            return res.status(400).json({ error: 'current_nav_or_price must be 0 or greater.' });
        if (units !== undefined && !isPositiveNumber(units))
            return res.status(400).json({ error: 'units must be greater than 0.' });

        const result = await pool.query(
            `UPDATE investments SET
               current_nav_or_price = COALESCE($1, current_nav_or_price),
               units = COALESCE($2, units),
               name = COALESCE($3, name),
               account_label = COALESCE($4, account_label),
               notes = COALESCE($5, notes),
               updated_at = NOW()
             WHERE id = $6 AND user_id = $7 RETURNING *`,
            [current_nav_or_price, units, name, account_label, notes, req.params.id, req.user.id]
        );
        res.json({ investment: withComputedFields(result.rows[0]) });
    } catch (err) {
        console.error('[Investments]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existing = await pool.query(
            'SELECT id, user_id FROM investments WHERE id = $1',
            [req.params.id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Investment not found.' });
        if (existing.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        await pool.query('DELETE FROM investments WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ message: 'Investment deleted' });
    } catch (err) {
        console.error('[Investments]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
