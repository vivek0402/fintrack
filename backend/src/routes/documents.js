const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isValidDocumentType, isValidFinancialYear } = require('../utils/validation');

const router = express.Router();
router.use(auth);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'fintrack-documents';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// POST /api/documents
router.post('/', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Invalid file upload.' });
        next();
    });
}, async (req, res) => {
    try {
        const { file } = req;
        const { name, type, financial_year, description } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'File is required.' });
        }
        if (!name || !type) {
            return res.status(400).json({ error: 'name and type are required.' });
        }
        if (!isValidDocumentType(type)) {
            return res.status(400).json({ error: 'Invalid document type.' });
        }
        if (financial_year && !isValidFinancialYear(financial_year)) {
            return res.status(400).json({ error: 'Invalid financial_year format. Expected YYYY-YY.' });
        }

        const documentId = crypto.randomUUID();
        const safeFileName = file.originalname.replace(/\s+/g, '_');
        const storagePath = `documents/${req.user.id}/${documentId}/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
            return res.status(502).json({ error: 'Failed to upload file to storage.' });
        }

        const result = await pool.query(
            `INSERT INTO documents
                (id, user_id, name, type, financial_year, storage_path, file_name, file_size_bytes, mime_type, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [documentId, req.user.id, name, type, financial_year || null, storagePath, file.originalname, file.size, file.mimetype, description || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[Documents] POST / error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/documents
router.get('/', async (req, res) => {
    try {
        const { type, financial_year } = req.query;
        const conditions = ['user_id = $1'];
        const params = [req.user.id];

        if (type) {
            params.push(type);
            conditions.push(`type = $${params.length}`);
        }
        if (financial_year) {
            params.push(financial_year);
            conditions.push(`financial_year = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT * FROM documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
            params
        );

        res.json(result.rows);
    } catch (err) {
        console.error('[Documents] GET / error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/documents/:id/download-url
router.get('/:id/download-url', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        const document = result.rows[0];
        if (!document) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(document.storage_path, 3600);

        if (error) {
            return res.status(502).json({ error: 'Failed to generate download URL.' });
        }

        res.json({
            download_url: data.signedUrl,
            expires_in_seconds: 3600,
            file_name: document.file_name,
            mime_type: document.mime_type,
        });
    } catch (err) {
        console.error('[Documents] GET /:id/download-url error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        const document = result.rows[0];
        if (!document) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        const { error } = await supabase.storage.from(BUCKET).remove([document.storage_path]);
        if (error && error.statusCode !== '404') {
            return res.status(502).json({ error: 'Failed to delete file from storage.' });
        }

        await pool.query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

        res.json({ message: 'Document deleted' });
    } catch (err) {
        console.error('[Documents] DELETE /:id error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
