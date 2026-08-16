const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { notifyOnce } = require('../utils/fcm');
const { isPositiveNumber, isNonNegativeNumber, isValidDateString, isValidTransactionType, isValidInvestmentType } = require('../utils/validation');
const { weightedAverageBuy } = require('../utils/investmentMath');
const { applyGoalContribution, fireGoalMilestoneChecks } = require('../utils/goals');
const router = express.Router();

router.use(auth);

router.get('/earliest', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT date FROM transactions WHERE user_id = $1 ORDER BY date ASC LIMIT 1',
            [req.user.id]
        );
        res.json({ date: result.rows[0]?.date || new Date().toISOString() });
    } catch (err) {
        console.error('[Transactions]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/search', async (req, res) => {
    try {
        const { q, limit } = req.query;
        if (!q || q.trim().length < 2) return res.json({ transactions: [] });

        const parsedLimit = parseInt(limit, 10);
        const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 20;

        const result = await pool.query(
            `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
         AND (LOWER(t.description) LIKE LOWER($2) OR LOWER(c.name) LIKE LOWER($2) OR LOWER(t.notes) LIKE LOWER($2))
       ORDER BY t.date DESC LIMIT $3`,
            [req.user.id, `%${q.trim()}%`, effectiveLimit]
        );
        res.json({ transactions: result.rows });
    } catch (err) {
        console.error('[Transactions] search failed:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const { type, month, year, category_id, credit_card_id, limit, offset } = req.query;
        let query = `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                         g.name AS group_name
                  FROM transactions t
                  LEFT JOIN categories c ON t.category_id = c.id
                  LEFT JOIN expense_groups g ON g.id = t.group_id
                  WHERE t.user_id = $1`;
        const params = [req.user.id];
        let n = 1;

        if (type) { n++; query += ` AND t.type = $${n}`; params.push(type); }
        if (month) { n++; query += ` AND EXTRACT(MONTH FROM t.date) = $${n}`; params.push(month); }
        if (year) { n++; query += ` AND EXTRACT(YEAR  FROM t.date) = $${n}`; params.push(year); }
        if (category_id) { n++; query += ` AND t.category_id = $${n}`; params.push(category_id); }
        if (credit_card_id) { n++; query += ` AND t.credit_card_id = $${n}`; params.push(credit_card_id); }

        query += ' ORDER BY t.date DESC, t.created_at DESC';

        const parsedLimit = parseInt(limit, 10);
        if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
            n++; query += ` LIMIT $${n}`; params.push(Math.min(parsedLimit, 500));

            const parsedOffset = parseInt(offset, 10);
            if (Number.isFinite(parsedOffset) && parsedOffset > 0) {
                n++; query += ` OFFSET $${n}`; params.push(parsedOffset);
            }
        }

        const result = await pool.query(query, params);
        res.json({ transactions: result.rows });
    } catch (err) {
        console.error('[Transactions]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { type, amount, description, notes, tags, date, category_id, account_id, credit_card_id, payment_method, investment_details, goal_id, source } = req.body;
        if (!type || !amount || !description || !date)
            return res.status(400).json({ error: 'Type, amount, description and date are required.' });
        if (!isValidTransactionType(type))
            return res.status(400).json({ error: "Type must be 'income' or 'expense'." });
        if (!isPositiveNumber(amount))
            return res.status(400).json({ error: 'Amount must be a positive number.' });
        if (!isValidDateString(date))
            return res.status(400).json({ error: 'Date must be a valid date (YYYY-MM-DD).' });
        if (credit_card_id) {
            // credit_card_id is only meaningful for user-entered spend -- the
            // income-side leg of a bill payment is written directly by
            // POST /api/credit-cards/:id/pay, never through this generic route.
            if (type !== 'expense')
                return res.status(400).json({ error: 'credit_card_id can only be set on an expense transaction.' });
            const { rows: cardCheck } = await pool.query(
                `SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2`,
                [credit_card_id, req.user.id]
            );
            if (!cardCheck.length)
                return res.status(400).json({ error: 'Invalid credit_card_id.' });
        }

        // Only 'manual' and 'sms' may be claimed by this public endpoint —
        // 'cams_import'/'pdf_import' are stamped server-side by their own
        // dedicated import routes, never by client-supplied input here.
        const txSource = source === 'sms' ? 'sms' : 'manual';

        let tx;
        let investmentResult = null;
        let goalResult = null;

        if (!investment_details && !goal_id) {
            const result = await pool.query(
                `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, tags, date, account_id, credit_card_id, payment_method, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
                [req.user.id, category_id || null, type, amount, description, notes || null, tags || [], date, account_id || null, credit_card_id || null, payment_method || 'Cash', txSource]
            );
            tx = result.rows[0];

            // Auto-assign to default account if none provided
            if (!account_id) {
                const { rows: defaults } = await pool.query(
                    `SELECT id FROM bank_accounts WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
                    [req.user.id]
                );
                if (defaults.length) {
                    await pool.query(
                        `UPDATE transactions SET account_id = $1 WHERE id = $2`,
                        [defaults[0].id, tx.id]
                    );
                    tx.account_id = defaults[0].id;
                }
            }
        } else {
            // Investments category with fund/asset details, and/or a linked savings
            // goal — create the transaction and apply whichever of those atomically
            // alongside it.
            let invType, name, ticker_or_folio, units, price_per_unit, scheme_code, account_label, invNotes;
            if (investment_details) {
                ({ type: invType, name, ticker_or_folio, units, price_per_unit, scheme_code, account_label, notes: invNotes } = investment_details);

                if (!isValidInvestmentType(invType))
                    return res.status(400).json({ error: 'Invalid investment type.' });
                if (!isPositiveNumber(units))
                    return res.status(400).json({ error: 'Investment units must be greater than 0.' });
                if (!isNonNegativeNumber(price_per_unit))
                    return res.status(400).json({ error: 'Investment price_per_unit must be 0 or greater.' });
                if (!name || !name.trim())
                    return res.status(400).json({ error: 'Investment name is required.' });
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const txResult = await client.query(
                    `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, tags, date, account_id, credit_card_id, payment_method, source)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
                    [req.user.id, category_id || null, type, amount, description, notes || null, tags || [], date, account_id || null, credit_card_id || null, payment_method || 'Cash', txSource]
                );
                tx = txResult.rows[0];

                if (!account_id) {
                    const { rows: defaults } = await client.query(
                        `SELECT id FROM bank_accounts WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
                        [req.user.id]
                    );
                    if (defaults.length) {
                        await client.query(`UPDATE transactions SET account_id = $1 WHERE id = $2`, [defaults[0].id, tx.id]);
                        tx.account_id = defaults[0].id;
                    }
                }

                if (investment_details) {
                    let investment, isNewHolding;

                    if (invType === 'mutual_fund' && scheme_code) {
                        // Race-free path: a unique index on (user_id, scheme_code) lets Postgres
                        // resolve concurrent/double-submitted buys of the same fund atomically —
                        // no separate SELECT-then-branch window for two requests to both "see" no
                        // existing holding and both INSERT a duplicate.
                        const upsertResult = await client.query(
                            `INSERT INTO investments
                                (user_id, type, name, ticker_or_folio, units, purchase_price_per_unit, current_nav_or_price,
                                 purchase_date, account_label, notes, scheme_code, last_price_updated_at, price_source)
                             VALUES ($1,'mutual_fund',$2,$3,$4,$5,$5,$6,$7,$8,$9,NOW(),'mfapi')
                             ON CONFLICT (user_id, scheme_code) WHERE scheme_code IS NOT NULL
                             DO UPDATE SET
                                units = investments.units + EXCLUDED.units,
                                purchase_price_per_unit = (investments.units * investments.purchase_price_per_unit
                                    + EXCLUDED.units * EXCLUDED.purchase_price_per_unit) / (investments.units + EXCLUDED.units),
                                current_nav_or_price = EXCLUDED.current_nav_or_price,
                                last_price_updated_at = NOW(),
                                price_source = 'mfapi',
                                updated_at = NOW()
                             RETURNING *, (created_at = updated_at) AS is_new_holding`,
                            [req.user.id, name.trim(), ticker_or_folio || null, units, price_per_unit,
                             date, account_label || null, invNotes || null, scheme_code]
                        );
                        investment = upsertResult.rows[0];
                        isNewHolding = investment.is_new_holding;
                    } else {
                        // No scheme_code (non-MF types, or MF entered without autocomplete): no unique
                        // constraint backs the match (free-text ticker/name could legitimately collide
                        // with pre-existing rows from manual entry or CAMS import), so serialize
                        // concurrent buys of the same identifier with a transaction-scoped advisory
                        // lock instead of a schema constraint.
                        const lockKey = `${req.user.id}:${invType}:${(ticker_or_folio || name.trim()).toLowerCase()}`;
                        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [lockKey]);

                        let existing;
                        if (ticker_or_folio) {
                            existing = await client.query(
                                `SELECT * FROM investments WHERE user_id = $1 AND type = $2 AND ticker_or_folio = $3`,
                                [req.user.id, invType, ticker_or_folio]
                            );
                        } else {
                            existing = await client.query(
                                `SELECT * FROM investments WHERE user_id = $1 AND type = $2 AND LOWER(name) = LOWER($3)`,
                                [req.user.id, invType, name.trim()]
                            );
                        }

                        if (existing.rows.length > 0) {
                            const row = existing.rows[0];
                            const { newUnits, newPrice } = weightedAverageBuy(
                                parseFloat(row.units), parseFloat(row.purchase_price_per_unit),
                                parseFloat(units), parseFloat(price_per_unit)
                            );
                            const updateResult = await client.query(
                                `UPDATE investments SET
                                    units = $1, purchase_price_per_unit = $2, current_nav_or_price = $3,
                                    updated_at = NOW()
                                 WHERE id = $4 RETURNING *`,
                                [newUnits, newPrice, price_per_unit, row.id]
                            );
                            investment = updateResult.rows[0];
                            isNewHolding = false;
                        } else {
                            const insertResult = await client.query(
                                `INSERT INTO investments
                                    (user_id, type, name, ticker_or_folio, units, purchase_price_per_unit, current_nav_or_price,
                                     purchase_date, account_label, notes, price_source)
                                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual') RETURNING *`,
                                [req.user.id, invType, name.trim(), ticker_or_folio || null, units, price_per_unit, price_per_unit,
                                 date, account_label || null, invNotes || null]
                            );
                            investment = insertResult.rows[0];
                            isNewHolding = true;
                        }
                    }

                    // First writer to investment_transactions — every buy made via this flow
                    // gets a proper ledger entry for downstream analytics use.
                    await client.query(
                        `INSERT INTO investment_transactions (investment_id, user_id, transaction_type, units, price_per_unit, transaction_date, notes)
                         VALUES ($1, $2, 'buy', $3, $4, $5, $6)`,
                        [investment.id, req.user.id, units, price_per_unit, date, invNotes || null]
                    );

                    investmentResult = {
                        id: investment.id,
                        is_new_holding: isNewHolding,
                        units: parseFloat(investment.units),
                        purchase_price_per_unit: parseFloat(investment.purchase_price_per_unit),
                        current_nav_or_price: parseFloat(investment.current_nav_or_price),
                    };
                }

                let updatedGoal = null;
                if (goal_id) {
                    updatedGoal = await applyGoalContribution(client, req.user.id, goal_id, parseFloat(amount));
                    if (!updatedGoal) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: 'Invalid goal_id.' });
                    }
                }

                await client.query('COMMIT');
                if (updatedGoal) {
                    goalResult = updatedGoal;
                    fireGoalMilestoneChecks(req.user.id, updatedGoal, parseFloat(amount));
                }
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }

        res.status(201).json({
            transaction: tx,
            ...(investmentResult ? { investment: investmentResult } : {}),
            ...(goalResult ? { goal: goalResult } : {}),
        });

        // Fire-and-forget: check if transaction count today is unusually high
        setImmediate(async () => {
            try {
                const today = tx.date;
                const alertKey = `high_tx_count:${req.user.id}:${today}`;

                const { rows } = await pool.query(
                    `SELECT COUNT(*) AS cnt FROM transactions WHERE user_id=$1 AND date=$2`,
                    [req.user.id, today]
                );
                const count = parseInt(rows[0]?.cnt || 0);
                if (count < 10) return;

                await notifyOnce(req.user.id, alertKey, {
                    title: 'High Spending Activity',
                    body: `You've logged ${count} transactions today. Everything going as planned?`,
                    data: { type: 'high_tx_count' },
                });
            } catch { /* silent */ }
        });

        // Fire-and-forget: check if any budget is now over 80%
        setImmediate(async () => {
            try {
                const month = tx.date.slice(0, 7); // 'YYYY-MM'
                const { rows: budgets } = await pool.query(
                    `SELECT b.id, b.category_id, b.amount,
                            COALESCE(SUM(t.amount),0) AS spent
                     FROM budgets b
                     LEFT JOIN transactions t
                       ON t.user_id = b.user_id
                      AND t.category_id = b.category_id
                      AND t.type = 'expense'
                      AND to_char(t.date, 'YYYY-MM') = $2
                     WHERE b.user_id = $1
                     GROUP BY b.id, b.category_id, b.amount
                     HAVING COALESCE(SUM(t.amount),0) / b.amount >= 0.8`,
                    [req.user.id, month]
                );

                for (const b of budgets) {
                    const pct = Math.round((b.spent / b.amount) * 100);
                    const alertKey = `budget_breach:${b.id}:${month}:${pct >= 100 ? '100' : '80'}`;

                    const { rows: cats } = await pool.query(
                        'SELECT name FROM categories WHERE id=$1', [b.category_id]
                    );
                    const catName = cats[0]?.name || 'A category';
                    await notifyOnce(req.user.id, alertKey, {
                        title: pct >= 100 ? 'Budget Exceeded' : 'Budget Alert',
                        body: `${catName}: ${pct}% of your budget used this month.`,
                        data: { type: 'budget_alert', category_id: String(b.category_id) },
                    });
                }
            } catch { /* silent — never delay response */ }
        });

        // Large transaction alert (>₹5000 expenses)
        setImmediate(async () => {
            try {
                const txAmount = parseFloat(tx.amount);
                if (txAmount < 5000 || tx.type !== 'expense') return;
                const alertKey = `large_tx:${tx.id}`;
                await notifyOnce(req.user.id, alertKey, {
                    title: 'Big Spend Alert 💸',
                    body: `You just logged ₹${txAmount.toLocaleString('en-IN')} for "${tx.description}". Hope it was totally worth it! 😊`,
                    data: { type: 'large_transaction', tx_id: String(tx.id) },
                });
            } catch { }
        });

        // Category spending spike vs same period last month (≥50% increase)
        setImmediate(async () => {
            try {
                if (!tx.category_id || tx.type !== 'expense') return;
                const monthStart = tx.date.slice(0, 8) + '01';
                const lastMonthDate = new Date(tx.date);
                lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
                const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                const lastMonthSameDay = lastMonthDate.toISOString().split('T')[0];

                const [{ rows: [thisRow] }, { rows: [lastRow] }] = await Promise.all([
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND category_id=$2 AND type='expense' AND date BETWEEN $3 AND $4`,
                        [req.user.id, tx.category_id, monthStart, tx.date]
                    ),
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND category_id=$2 AND type='expense' AND date BETWEEN $3 AND $4`,
                        [req.user.id, tx.category_id, lastMonthStart, lastMonthSameDay]
                    ),
                ]);
                const thisTotal = parseFloat(thisRow.total);
                const lastTotal = parseFloat(lastRow.total);
                if (lastTotal < 500 || thisTotal < lastTotal * 1.5) return;

                const pct = Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
                const alertKey = `cat_spike:${tx.category_id}:${tx.date.slice(0, 7)}`;

                const { rows: cats } = await pool.query('SELECT name FROM categories WHERE id=$1', [tx.category_id]);
                await notifyOnce(req.user.id, alertKey, {
                    title: 'Spending Spike Spotted 📊',
                    body: `Your ${cats[0]?.name || 'category'} spending is ${pct}% higher than last month at this point. Just keeping you in the loop! 😊`,
                    data: { type: 'category_spike', category_id: String(tx.category_id) },
                });
            } catch { }
        });

        // Spending streak (notify at 3, 7, 14, 30 days)
        setImmediate(async () => {
            try {
                const { rows: datRows } = await pool.query(
                    `SELECT DISTINCT date::text FROM transactions
                     WHERE user_id=$1 AND date >= CURRENT_DATE - INTERVAL '31 days'
                     ORDER BY date DESC`,
                    [req.user.id]
                );
                let streak = 0;
                for (let i = 0; i < datRows.length; i++) {
                    const expected = new Date(tx.date);
                    expected.setDate(new Date(tx.date).getDate() - i);
                    if (datRows[i].date === expected.toISOString().split('T')[0]) streak++;
                    else break;
                }
                if (![3, 7, 14, 30].includes(streak)) return;

                const alertKey = `streak:${streak}:${tx.date.slice(0, 7)}`;
                await notifyOnce(req.user.id, alertKey, {
                    title: `${streak}-Day Tracking Streak! 🔥`,
                    body: streak === 30
                        ? `30 days straight of logging your finances — you're an absolute rockstar! 🌟`
                        : `${streak} days in a row of tracking your spending — you're absolutely crushing it! Keep going! 💪`,
                    data: { type: 'streak', days: String(streak) },
                });
            } catch { }
        });
    } catch (err) {
        console.error('[Transactions]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Note: editing a transaction never touches the investments/investment_transactions
// rows it may have created — that buy already happened; reversing it via edit could
// leave undefined states if other buys/sells occurred on the holding since. Deliberate.
// Goal linkage is different: saved_amount is a plain running total with no
// weighted-average complexity, so it's safe (and expected) to keep it accurate
// across edits -- see the goal-reconciliation block below.
router.put('/:id', async (req, res) => {
    try {
        const { type, amount, description, notes, tags, date, category_id, credit_card_id, payment_method } = req.body;
        if (type !== undefined && !isValidTransactionType(type))
            return res.status(400).json({ error: "Type must be 'income' or 'expense'." });
        if (amount !== undefined && !isPositiveNumber(amount))
            return res.status(400).json({ error: 'Amount must be a positive number.' });
        if (date !== undefined && !isValidDateString(date))
            return res.status(400).json({ error: 'Date must be a valid date (YYYY-MM-DD).' });
        if (credit_card_id) {
            if (type !== undefined && type !== 'expense')
                return res.status(400).json({ error: 'credit_card_id can only be set on an expense transaction.' });
            const { rows: cardCheck } = await pool.query(
                `SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2`,
                [credit_card_id, req.user.id]
            );
            if (!cardCheck.length)
                return res.status(400).json({ error: 'Invalid credit_card_id.' });
        }

        const existing = await pool.query(
            'SELECT id, goal_id, amount FROM transactions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Transaction not found.' });
        const before = existing.rows[0];

        // credit_card_id: explicitly clear it (not just leave stale) whenever the
        // client sends payment_method other than 'Credit Card', or sends
        // credit_card_id: null outright -- same "explicit null" reasoning as notes
        // above, since a bare COALESCE would never let a real value go back to null.
        const clearCreditCardId = ('payment_method' in req.body && payment_method !== 'Credit Card')
            || ('credit_card_id' in req.body && req.body.credit_card_id === null);

        // goal_id: same "explicit null to clear" pattern. If the goal is changing
        // (including to/from unlinked) or the amount is changing on a linked goal,
        // the contribution needs to be reconciled on the goal(s) involved.
        const goalIdProvided = 'goal_id' in req.body;
        const clearGoalId = goalIdProvided && req.body.goal_id === null;
        const newGoalId = goalIdProvided ? (req.body.goal_id || null) : before.goal_id;
        const newAmount = amount !== undefined ? parseFloat(amount) : parseFloat(before.amount);

        if (newGoalId && newGoalId !== before.goal_id) {
            const { rows: goalCheck } = await pool.query(
                'SELECT id FROM savings_goals WHERE id = $1 AND user_id = $2',
                [newGoalId, req.user.id]
            );
            if (!goalCheck.length)
                return res.status(400).json({ error: 'Invalid goal_id.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE transactions SET
             type = COALESCE($1,type), amount = COALESCE($2,amount),
             description = COALESCE($3,description),
             notes = CASE WHEN $4::text IS NOT NULL THEN $4 WHEN $11::boolean THEN NULL ELSE notes END,
             tags = COALESCE($5,tags), date = COALESCE($6,date),
             category_id = $7,
             credit_card_id = CASE WHEN $12::boolean THEN NULL ELSE COALESCE($13,credit_card_id) END,
             goal_id = CASE WHEN $14::boolean THEN NULL ELSE COALESCE($15::uuid,goal_id) END,
             payment_method = COALESCE($8,payment_method), updated_at = NOW()
           WHERE id = $9 AND user_id = $10 RETURNING *`,
                [type, amount, description, notes, tags, date, category_id, payment_method,
                 req.params.id, req.user.id, 'notes' in req.body && req.body.notes === null,
                 clearCreditCardId, credit_card_id || null,
                 clearGoalId, goalIdProvided && req.body.goal_id ? req.body.goal_id : null]
            );

            const goalChanged = before.goal_id !== newGoalId;
            const amountChangedOnSameGoal = !goalChanged && newGoalId && newAmount !== parseFloat(before.amount);
            let oldGoalResult = null, newGoalResult = null;
            if (goalChanged || amountChangedOnSameGoal) {
                if (before.goal_id) oldGoalResult = await applyGoalContribution(client, req.user.id, before.goal_id, -parseFloat(before.amount));
                if (newGoalId) newGoalResult = await applyGoalContribution(client, req.user.id, newGoalId, newAmount);
            }

            await client.query('COMMIT');
            res.json({ transaction: result.rows[0] });

            if (oldGoalResult) fireGoalMilestoneChecks(req.user.id, oldGoalResult, -parseFloat(before.amount));
            if (newGoalResult) fireGoalMilestoneChecks(req.user.id, newGoalResult, newAmount);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[Transactions]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});


// Note: deleting a transaction never unwinds the matched investments/investment_transactions
// rows either, for the same reason as the PUT handler above. Deliberate.
router.delete('/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id, source, transfer_group_id, goal_id, amount',
                [req.params.id, req.user.id]
            );
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Transaction not found.' });
            }
            // A credit card bill payment (or any future transfer_group_id-linked
            // pair) is two rows sharing one group id -- deleting one leg without
            // the other would leave an orphaned half-transaction, so delete any
            // sibling too.
            if (result.rows[0].transfer_group_id) {
                await client.query(
                    'DELETE FROM transactions WHERE transfer_group_id = $1 AND user_id = $2',
                    [result.rows[0].transfer_group_id, req.user.id]
                );
            }
            await client.query(
                'INSERT INTO transaction_deletions (user_id, source) VALUES ($1, $2)',
                [req.user.id, result.rows[0].source]
            );
            let deletedGoalResult = null;
            if (result.rows[0].goal_id) {
                deletedGoalResult = await applyGoalContribution(client, req.user.id, result.rows[0].goal_id, -parseFloat(result.rows[0].amount));
            }
            await client.query('COMMIT');
            res.json({ message: 'Deleted.' });
            if (deletedGoalResult) fireGoalMilestoneChecks(req.user.id, deletedGoalResult, -parseFloat(result.rows[0].amount));
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[Transactions]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;