const jwt = require('jsonwebtoken');

// Android home-screen widgets refresh in the background for months, long
// after a normal 15-minute access token has expired (the reason the old
// widgets went stale). They get their own long-lived JWT instead, which:
//   - carries `scope: 'widget'`, so middleware/auth.js refuses it on every
//     normal API route, and middleware/widgetAuth.js accepts nothing else;
//   - carries `ver`, the user's widget_token_version at issue time, so
//     POST /api/widget/revoke can kill every outstanding widget token at once.
const WIDGET_SCOPE = 'widget';
const WIDGET_TOKEN_TTL_DAYS = 180;

function signWidgetToken(userId, version) {
    return jwt.sign(
        { id: userId, scope: WIDGET_SCOPE, ver: version },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: `${WIDGET_TOKEN_TTL_DAYS}d` }
    );
}

module.exports = { WIDGET_SCOPE, WIDGET_TOKEN_TTL_DAYS, signWidgetToken };
