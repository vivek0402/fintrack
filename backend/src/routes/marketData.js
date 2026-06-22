const express = require('express');
const auth = require('../middleware/auth');
const { searchSchemes, getLatestNav } = require('../utils/marketData');
const router = express.Router();

router.use(auth);

// GET /api/market-data/mf/search?q=axis+bluechip
router.get('/mf/search', async (req, res) => {
    const { q } = req.query;
    const results = await searchSchemes(q || '');
    res.json({
        results: results.map(r => ({ schemeCode: String(r.schemeCode), schemeName: r.schemeName })),
    });
});

// GET /api/market-data/mf/:schemeCode/nav
router.get('/mf/:schemeCode/nav', async (req, res) => {
    const nav = await getLatestNav(req.params.schemeCode);
    if (!nav) return res.status(404).json({ error: 'NAV not available for this scheme right now.' });
    res.json({ nav });
});

module.exports = router;
