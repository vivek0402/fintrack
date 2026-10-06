const jwt = require('jsonwebtoken');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Rate-limit key: the signed-in user's id when the request carries a valid
 * access token, else the client IP. Keying by user means one person's app
 * (which fans out dozens of reads per screen) can't exhaust a budget shared
 * with everyone else behind the same mobile-carrier IP, and vice versa.
 */
function userOrIpKey(prefix) {
    return (req) => {
        const auth = req.headers['authorization'];
        if (auth && auth.startsWith('Bearer ')) {
            try {
                const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
                return `${prefix}:user:${decoded.id}`;
            } catch { /* fall through to IP */ }
        }
        return ipKeyGenerator(req.ip);
    };
}

module.exports = { userOrIpKey };
