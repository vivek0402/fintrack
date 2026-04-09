const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

// GET /api/one-time-expenses — list all for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.*,
        ba.name as bank_account_name,
        ba.bank_name
      FROM one_time_expenses o
      LEFT JOIN bank_accounts ba ON o.bank_account_id = ba.id
      WHERE o.user_id = $1
      ORDER BY o.date DESC
    `, [req.user.id]);
    res.json({ expenses: result.rows });
  } catch (err) {
    console.error('[OneTimeExpenses] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch one-time expenses' });
  }
});

// POST /api/one-time-expenses — create new
router.post('/', authMiddleware, async (req, res) => {
  const { bank_account_id, title, amount, category, date, notes, tags, icon, color } = req.body;
  if (!title || !amount || !date) {
    return res.status(400).json({ error: 'title, amount, and date are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO one_time_expenses
        (user_id, bank_account_id, title, amount, category, date, notes, tags, icon, color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      req.user.id,
      bank_account_id ? parseInt(bank_account_id, 10) : null,
      title,
      parseFloat(amount),
      category || 'Other',
      date,
      notes || null,
      tags || [],
      icon || 'receipt',
      color || '#a855f7'
    ]);

    if (bank_account_id) {
      await client.query(`
        UPDATE bank_accounts
        SET balance = balance - $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
      `, [parseFloat(amount), bank_account_id, req.user.id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ expense: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OneTimeExpenses] POST error:', err.message);
    res.status(500).json({ error: 'Failed to create one-time expense' });
  } finally {
    client.release();
  }
});

// PUT /api/one-time-expenses/:id — update
router.put('/:id', authMiddleware, async (req, res) => {
  const { title, amount, category, date, notes, tags, icon, color, bank_account_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found' });
    }
    const old = existing.rows[0];

    // Reverse old bank deduction
    if (old.bank_account_id) {
      await client.query(`
        UPDATE bank_accounts SET balance = balance + $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
      `, [parseFloat(old.amount), old.bank_account_id, req.user.id]);
    }

    // Apply new bank deduction
    const newBankId = bank_account_id !== undefined
      ? (bank_account_id ? parseInt(bank_account_id, 10) : null)
      : old.bank_account_id;
    if (newBankId) {
      await client.query(`
        UPDATE bank_accounts SET balance = balance - $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
      `, [parseFloat(amount || old.amount), newBankId, req.user.id]);
    }

    const result = await client.query(`
      UPDATE one_time_expenses SET
        title = $1, amount = $2, category = $3, date = $4,
        notes = $5, tags = $6, icon = $7, color = $8,
        bank_account_id = $9, updated_at = NOW()
      WHERE id = $10 AND user_id = $11
      RETURNING *
    `, [
      title || old.title,
      parseFloat(amount || old.amount),
      category || old.category,
      date || old.date,
      notes !== undefined ? notes : old.notes,
      tags || old.tags,
      icon || old.icon,
      color || old.color,
      newBankId,
      req.params.id,
      req.user.id
    ]);

    await client.query('COMMIT');
    res.json({ expense: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OneTimeExpenses] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to update expense' });
  } finally {
    client.release();
  }
});

// DELETE /api/one-time-expenses/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found' });
    }
    const old = existing.rows[0];

    if (old.bank_account_id) {
      await client.query(`
        UPDATE bank_accounts SET balance = balance + $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
      `, [parseFloat(old.amount), old.bank_account_id, req.user.id]);
    }

    await client.query('DELETE FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OneTimeExpenses] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete expense' });
  } finally {
    client.release();
  }
});

module.exports = router;
