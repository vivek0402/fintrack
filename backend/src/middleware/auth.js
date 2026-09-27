const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        // Normal access tokens carry no `scope`. Any scoped token -- today the
        // long-lived Android widget token (utils/widgetToken.js) -- is refused
        // here, so it can only ever reach the routes that opt into it
        // (middleware/widgetAuth.js), never the rest of the API.
        if (decoded.scope !== undefined) {
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};