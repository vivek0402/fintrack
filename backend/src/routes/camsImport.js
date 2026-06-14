const multer = require('multer');
const pdfParse = require('pdf-parse');
const { aiComplete } = require('../utils/ai');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = require('express').Router();

router.use(auth);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted'), false);
    }
});

router.post('/cams-statement', (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Invalid file upload.' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

        const jobResult = await pool.query(
            `INSERT INTO cams_import_jobs (user_id, file_name, status) VALUES ($1,$2,'processing') RETURNING id`,
            [req.user.id, req.file.originalname]
        );
        const jobId = jobResult.rows[0].id;

        let pdfData;
        try {
            pdfData = await pdfParse(req.file.buffer);
        } catch (e) {
            await pool.query(
                'UPDATE cams_import_jobs SET status=$1, error_message=$2 WHERE id=$3',
                ['failed', 'PDF could not be read', jobId]
            );
            return res.status(422).json({ error: 'Could not read this PDF. Scanned PDFs are not supported — please use a text-based CAS statement.' });
        }

        if (pdfData.text.trim().length < 100) {
            await pool.query(
                'UPDATE cams_import_jobs SET status=$1, error_message=$2 WHERE id=$3',
                ['failed', 'PDF appears to be empty or a scanned image', jobId]
            );
            return res.status(422).json({ error: 'PDF appears to be empty or a scanned image. Scanned PDFs are not supported — please use a text-based CAS statement.' });
        }

        const text = pdfData.text.slice(0, 15000);

        const messages = [
            {
                role: 'system',
                content: `You are a CAMS Consolidated Account Statement (CAS) parser for Indian mutual funds. Extract all mutual fund holdings from the statement text. Return ONLY valid JSON with no explanation or markdown. Use this exact format:
{"holdings":[{"folio_number":"folio number as string","fund_house":"AMC name","scheme_name":"scheme name","units":123.456,"nav":12.34,"current_value":1234.56,"purchase_details":[{"date":"YYYY-MM-DD","units":10.5,"price_per_unit":12.34}]}]}
Rules: units, nav, current_value, and price_per_unit must be numbers (not strings). purchase_details should contain each purchase/SIP lot found for that folio. Return empty array if no holdings found.`
            },
            { role: 'user', content: `Parse this CAMS CAS statement:\n\n${text}` }
        ];

        const rawResponse = await aiComplete('cams-import', messages);

        let parsed;
        try {
            const clean = rawResponse.replace(/```json|```/g, '').trim();
            parsed = JSON.parse(clean);
        } catch (e) {
            await pool.query(
                'UPDATE cams_import_jobs SET status=$1, error_message=$2 WHERE id=$3',
                ['failed', 'AI could not parse statement format', jobId]
            );
            return res.status(422).json({ error: 'Could not parse this CAS statement format. Try a different PDF or add investments manually.' });
        }

        const holdings = Array.isArray(parsed.holdings) ? parsed.holdings : [];

        await pool.query(
            `UPDATE cams_import_jobs SET status='review', holdings_found=$1, extracted_data=$2, updated_at=NOW() WHERE id=$3`,
            [holdings.length, JSON.stringify(parsed), jobId]
        );

        res.json({
            jobId,
            holdingsCount: holdings.length,
            holdings,
        });
    } catch (err) {
        console.error('[CamsImport]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/cams-statement/:jobId/confirm', async (req, res) => {
    try {
        const jobResult = await pool.query(
            'SELECT * FROM cams_import_jobs WHERE id=$1',
            [req.params.jobId]
        );
        if (jobResult.rows.length === 0)
            return res.status(404).json({ error: 'Import job not found.' });
        if (jobResult.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'You do not have access to this import job.' });
        if (jobResult.rows[0].status !== 'review')
            return res.status(400).json({ error: 'This import job is not awaiting review.' });

        const { holdings } = req.body;
        if (!Array.isArray(holdings))
            return res.status(400).json({ error: 'holdings must be an array.' });

        const client = await pool.connect();
        let created = 0;
        let updated = 0;
        try {
            await client.query('BEGIN');
            for (const h of holdings) {
                const units = parseFloat(h.units);
                const nav = parseFloat(h.nav);
                const purchaseDetails = Array.isArray(h.purchase_details) ? h.purchase_details : [];

                const existing = await client.query(
                    'SELECT id FROM investments WHERE user_id=$1 AND ticker_or_folio=$2',
                    [req.user.id, h.folio_number]
                );

                if (existing.rows.length > 0) {
                    await client.query(
                        'UPDATE investments SET units=$1, current_nav_or_price=$2, updated_at=NOW() WHERE id=$3',
                        [units, nav, existing.rows[0].id]
                    );
                    updated++;
                } else {
                    let purchaseDate = new Date().toISOString().slice(0, 10);
                    let purchasePrice = nav;
                    if (purchaseDetails.length > 0) {
                        const earliest = purchaseDetails.reduce((min, p) =>
                            new Date(p.date) < new Date(min.date) ? p : min
                        );
                        purchaseDate = earliest.date;
                        purchasePrice = parseFloat(earliest.price_per_unit);
                    }

                    await client.query(
                        `INSERT INTO investments
                            (user_id, type, name, ticker_or_folio, units, purchase_price_per_unit, current_nav_or_price, purchase_date)
                         VALUES ($1,'mutual_fund',$2,$3,$4,$5,$6,$7)`,
                        [req.user.id, h.scheme_name, h.folio_number, units, purchasePrice, nav, purchaseDate]
                    );
                    created++;
                }
            }

            const total = created + updated;
            await client.query(
                'UPDATE cams_import_jobs SET status=$1, holdings_imported=$2, updated_at=NOW() WHERE id=$3',
                ['imported', total, req.params.jobId]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        res.json({ created, updated, imported: created + updated });
    } catch (err) {
        console.error('[CamsImport]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
