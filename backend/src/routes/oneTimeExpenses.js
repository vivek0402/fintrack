const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

// ─── PARENT EXPENSE ROUTES ────────────────────────────────────────────────────

// GET /api/one-time-expenses
router.get('/', authMiddleware, async (req, res) => {
  try {
    const expenses = await pool.query(`
      SELECT
        o.*,
        ba.name  AS bank_account_name,
        COALESCE(SUM(i.amount), 0)::float AS total_amount,
        COUNT(i.id)::int                  AS item_count
      FROM one_time_expenses o
      LEFT JOIN bank_accounts ba          ON ba.id = o.bank_account_id
      LEFT JOIN one_time_expense_items i  ON i.expense_id = o.id
      WHERE o.user_id = $1
      GROUP BY o.id, ba.name
      ORDER BY o.created_at DESC
    `, [req.user.id]);

    const expenseIds = expenses.rows.map(e => e.id);
    let items = [];
    if (expenseIds.length > 0) {
      const itemsResult = await pool.query(`
        SELECT * FROM one_time_expense_items
        WHERE expense_id = ANY($1::uuid[])
        ORDER BY date ASC, created_at ASC
      `, [expenseIds]);
      items = itemsResult.rows;
    }

    const result = expenses.rows.map(exp => ({
      ...exp,
      total_amount: parseFloat(exp.total_amount) || 0,
      items: items.filter(i => i.expense_id === exp.id),
    }));

    res.json({ expenses: result });
  } catch (err) {
    console.error('[OneTimeExpenses] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST /api/one-time-expenses — create parent (no amount; starts empty)
router.post('/', authMiddleware, async (req, res) => {
  const { bank_account_id, title, category, notes, icon, color, start_date, end_date } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const result = await pool.query(`
      INSERT INTO one_time_expenses
        (user_id, bank_account_id, title, amount, category, date, notes, icon, color, start_date, end_date, computed_amount)
      VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, 0)
      RETURNING *
    `, [
      req.user.id,
      bank_account_id ? parseInt(bank_account_id, 10) : null,
      title,
      category || 'Other',
      start_date || new Date().toISOString().split('T')[0],
      notes || null,
      icon || 'receipt',
      color || '#a855f7',
      start_date || null,
      end_date || null,
    ]);
    res.status(201).json({ expense: { ...result.rows[0], items: [], total_amount: 0, item_count: 0 } });
  } catch (err) {
    console.error('[OneTimeExpenses] POST error:', err.message);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// PUT /api/one-time-expenses/:id — update metadata only (bank account change rebalances)
router.put('/:id', authMiddleware, async (req, res) => {
  const { title, category, notes, icon, color, bank_account_id, start_date, end_date } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const old = existing.rows[0];

    const totalResult = await client.query(
      'SELECT COALESCE(SUM(amount), 0)::float AS total FROM one_time_expense_items WHERE expense_id = $1',
      [req.params.id]
    );
    const total = parseFloat(totalResult.rows[0].total);

    const newBankId = bank_account_id !== undefined
      ? (bank_account_id ? parseInt(bank_account_id, 10) : null)
      : old.bank_account_id;

    // Rebalance only when bank account actually changes
    if (old.bank_account_id !== newBankId) {
      if (old.bank_account_id && total > 0) {
        await client.query(
          'UPDATE bank_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [total, old.bank_account_id, req.user.id]
        );
      }
      if (newBankId && total > 0) {
        await client.query(
          'UPDATE bank_accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [total, newBankId, req.user.id]
        );
      }
    }

    const result = await client.query(`
      UPDATE one_time_expenses SET
        title          = $1,
        category       = $2,
        notes          = $3,
        icon           = $4,
        color          = $5,
        bank_account_id = $6,
        start_date     = $7,
        end_date       = $8,
        updated_at     = NOW()
      WHERE id = $9 AND user_id = $10
      RETURNING *
    `, [
      title    || old.title,
      category || old.category,
      notes !== undefined ? notes : old.notes,
      icon     || old.icon,
      color    || old.color,
      newBankId,
      start_date !== undefined ? start_date : old.start_date,
      end_date   !== undefined ? end_date   : old.end_date,
      req.params.id,
      req.user.id,
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

// DELETE /api/one-time-expenses/:id — cascades to items, restores bank balance
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const old = existing.rows[0];

    const totalResult = await client.query(
      'SELECT COALESCE(SUM(amount), 0)::float AS total FROM one_time_expense_items WHERE expense_id = $1',
      [req.params.id]
    );
    const total = parseFloat(totalResult.rows[0].total);

    if (old.bank_account_id && total > 0) {
      await client.query(
        'UPDATE bank_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [total, old.bank_account_id, req.user.id]
      );
    }

    await client.query(
      'DELETE FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, restoredAmount: total });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OneTimeExpenses] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete expense' });
  } finally {
    client.release();
  }
});

// ─── ITEM ROUTES ──────────────────────────────────────────────────────────────

// POST /api/one-time-expenses/:id/items
router.post('/:id/items', authMiddleware, async (req, res) => {
  const { description, amount, category, date, payment_method, notes } = req.body;
  if (!description || !amount || !date) {
    return res.status(400).json({ error: 'description, amount, date are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const parent = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!parent.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found' });
    }

    const item = await client.query(`
      INSERT INTO one_time_expense_items
        (expense_id, user_id, description, amount, category, date, payment_method, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.params.id, req.user.id, description,
      parseFloat(amount), category || 'Other',
      date, payment_method || 'Cash', notes || null,
    ]);

    await client.query(`
      UPDATE one_time_expenses
      SET computed_amount = (SELECT COALESCE(SUM(amount), 0) FROM one_time_expense_items WHERE expense_id = $1),
          updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    if (parent.rows[0].bank_account_id) {
      await client.query(
        'UPDATE bank_accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [parseFloat(amount), parent.rows[0].bank_account_id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ item: item.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ExpenseItems] POST error:', err.message);
    res.status(500).json({ error: 'Failed to add item' });
  } finally {
    client.release();
  }
});

// PUT /api/one-time-expenses/:id/items/:itemId
router.put('/:id/items/:itemId', authMiddleware, async (req, res) => {
  const { description, amount, category, date, payment_method, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const item = await client.query(
      'SELECT * FROM one_time_expense_items WHERE id = $1 AND expense_id = $2 AND user_id = $3',
      [req.params.itemId, req.params.id, req.user.id]
    );
    if (!item.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    const old = item.rows[0];

    const parent = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    const newAmount = parseFloat(amount || old.amount);
    const diff = newAmount - parseFloat(old.amount);

    const updated = await client.query(`
      UPDATE one_time_expense_items SET
        description    = $1,
        amount         = $2,
        category       = $3,
        date           = $4,
        payment_method = $5,
        notes          = $6
      WHERE id = $7 AND user_id = $8
      RETURNING *
    `, [
      description    || old.description,
      newAmount,
      category       || old.category,
      date           || old.date,
      payment_method || old.payment_method,
      notes !== undefined ? notes : old.notes,
      req.params.itemId,
      req.user.id,
    ]);

    await client.query(`
      UPDATE one_time_expenses
      SET computed_amount = (SELECT COALESCE(SUM(amount), 0) FROM one_time_expense_items WHERE expense_id = $1),
          updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    if (parent.rows[0]?.bank_account_id && diff !== 0) {
      await client.query(
        'UPDATE bank_accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [diff, parent.rows[0].bank_account_id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ item: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ExpenseItems] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to update item' });
  } finally {
    client.release();
  }
});

// DELETE /api/one-time-expenses/:id/items/:itemId
router.delete('/:id/items/:itemId', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const item = await client.query(
      'SELECT * FROM one_time_expense_items WHERE id = $1 AND expense_id = $2 AND user_id = $3',
      [req.params.itemId, req.params.id, req.user.id]
    );
    if (!item.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    const parent = await client.query(
      'SELECT * FROM one_time_expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    await client.query('DELETE FROM one_time_expense_items WHERE id = $1', [req.params.itemId]);

    await client.query(`
      UPDATE one_time_expenses
      SET computed_amount = (SELECT COALESCE(SUM(amount), 0) FROM one_time_expense_items WHERE expense_id = $1),
          updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    if (parent.rows[0]?.bank_account_id) {
      await client.query(
        'UPDATE bank_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [parseFloat(item.rows[0].amount), parent.rows[0].bank_account_id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ExpenseItems] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete item' });
  } finally {
    client.release();
  }
});

module.exports = router;
