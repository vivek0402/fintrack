const multer = require('multer');
const pdfParse = require('pdf-parse');
const { aiComplete } = require('../utils/ai');
const pool = require('../db/pool');
const { isValidDateString, isPositiveNumber, isValidTransactionType } = require('../utils/validation');
const auth = require('../middleware/auth');
const router = require('express').Router();

router.use(auth);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted'), false);
    }
});

router.post('/bank-statement', (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Invalid file upload.' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

        const { bank_name } = req.body;
        const jobResult = await pool.query(
            `INSERT INTO pdf_import_jobs (user_id, file_name, bank_name, status) VALUES ($1,$2,$3,'processing') RETURNING id`,
            [req.user.id, req.file.originalname, bank_name || null]
        );
        const jobId = jobResult.rows[0].id;

        let pdfData;
        try {
            pdfData = await pdfParse(req.file.buffer);
        } catch (e) {
            await pool.query(
                'UPDATE pdf_import_jobs SET status=$1, error_message=$2 WHERE id=$3',
                ['failed', 'PDF could not be read', jobId]
            );
            return res.status(422).json({ error: 'Could not read this PDF. Please use a text-based PDF (not a scan).' });
        }

        if (pdfData.text.trim().length < 50) {
            await pool.query(
                'UPDATE pdf_import_jobs SET status=$1, error_message=$2 WHERE id=$3',
                ['failed', 'PDF appears to be empty or a scanned image', jobId]
            );
            return res.status(422).json({ error: 'PDF appears to be empty or a scanned image. Only text-based bank statements are supported.' });
        }

        const text = pdfData.text.slice(0, 12000);

        const messages = [
            {
                role: 'system',
                content: `You are a bank statement parser for Indian banks. Extract all debit and credit transactions from the statement text. Return ONLY valid JSON with no explanation or markdown. Use this exact format:
{"bank":"bank name or Unknown","account_last4":"last 4 digits or null","transactions":[{"date":"YYYY-MM-DD","description":"merchant or narration text","amount":1234.56,"type":"income or expense"}]}
Rules: Credits/deposits/salary/refunds = income. Debits/withdrawals/payments/charges = expense. amount must always be positive. Skip rows that are opening balance, closing balance, or statement summaries. Return empty array if no transactions found.`
            },
            { role: 'user', content: `Parse this bank statement:\n\n${text}` }
        ];

        const rawResponse = await aiComplete('pdf-import', messages);

        let parsed;
        try {
            const clean = rawResponse.replace(/```json|```/g, '').trim();
            parsed = JSON.parse(clean);
        } catch (e) {
            await pool.query(
                'UPDATE pdf_import_jobs SET status=$1, error_message=$2 WHERE id=$3',
                ['failed', 'AI could not parse statement format', jobId]
            );
            return res.status(422).json({ error: 'Could not parse this statement format. Try a different PDF or add transactions manually.' });
        }

        await pool.query(
            `UPDATE pdf_import_jobs SET status='review', rows_extracted=$1, extracted_data=$2, bank_name=$3, updated_at=NOW() WHERE id=$4`,
            [parsed.transactions.length, JSON.stringify(parsed), parsed.bank || bank_name || null, jobId]
        );

        res.json({
            jobId,
            bank: parsed.bank,
            account_last4: parsed.account_last4,
            transactionCount: parsed.transactions.length,
            transactions: parsed.transactions,
        });
    } catch (err) {
        console.error('[PdfImport]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/bank-statement/:jobId/confirm', async (req, res) => {
    try {
        const jobResult = await pool.query(
            'SELECT * FROM pdf_import_jobs WHERE id=$1 AND user_id=$2',
            [req.params.jobId, req.user.id]
        );
        if (jobResult.rows.length === 0)
            return res.status(404).json({ error: 'Import job not found.' });
        if (jobResult.rows[0].status !== 'review')
            return res.status(400).json({ error: 'This import job is not awaiting review.' });

        const { transactions } = req.body;
        if (!Array.isArray(transactions))
            return res.status(400).json({ error: 'transactions must be an array.' });

        for (const t of transactions) {
            if (!isValidDateString(t.date))
                return res.status(400).json({ error: 'Each transaction must have a valid date.' });
            if (!isPositiveNumber(t.amount))
                return res.status(400).json({ error: 'Each transaction must have a positive amount.' });
            if (!isValidTransactionType(t.type))
                return res.status(400).json({ error: "Each transaction type must be 'income' or 'expense'." });
        }

        const client = await pool.connect();
        let count = 0;
        try {
            await client.query('BEGIN');
            for (const t of transactions) {
                await client.query(
                    'INSERT INTO transactions (user_id, amount, type, description, date, category_id) VALUES ($1,$2,$3,$4,$5,NULL)',
                    [req.user.id, t.amount, t.type, t.description, t.date]
                );
                count++;
            }
            await client.query(
                'UPDATE pdf_import_jobs SET status=$1, rows_imported=$2, updated_at=NOW() WHERE id=$3',
                ['imported', count, req.params.jobId]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        res.json({ imported: count });
    } catch (err) {
        console.error('[PdfImport]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/history', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, bank_name, file_name, status, rows_extracted, rows_imported, created_at
             FROM pdf_import_jobs
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [req.user.id]
        );
        res.json({ history: result.rows });
    } catch (err) {
        console.error('[PdfImport]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
