const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { WIDGET_SCOPE } = require('../utils/widgetToken');

// Accepts ONLY widget-scoped tokens (utils/widgetToken.js), and only while
// their `ver` still matches users.widget_token_version. A normal access
// token is refused here, just as middleware/auth.js refuses widget tokens.
module.exports = async function widgetAuthMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (decoded.scope !== WIDGET_SCOPE || !decoded.id || !Number.isInteger(decoded.ver)) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT widget_token_version FROM users WHERE id = $1',
            [decoded.id]
        );
        if (!rows.length || Number(rows[0].widget_token_version) !== decoded.ver) {
            return res.status(401).json({ error: 'Widget token revoked.' });
        }
    } catch {
        return res.status(500).json({ error: 'Server error.' });
    }

    req.user = { id: decoded.id, scope: WIDGET_SCOPE };
    next();
};
