// Notification deep links are navigated to on tap (push) and on click (bell),
// so they must only ever point inside the app. A valid link is an internal
// path: it starts with exactly one "/", and contains no backslash (browsers
// treat "\" like "/", so "/\evil.com" is protocol-relative) and no control
// characters (tabs/newlines are stripped by URL parsers, so "/\t/evil.com"
// would become "//evil.com"), and no "." / ".." path segments ("/..//x"
// normalises to "//x"). This rejects "//host", every scheme ("javascript:",
// "http:", "intent:", "data:", ...) and relative paths.
// Mirrored by frontend/lib/deepLink.ts; keep the two in sync.

const MAX_DEEP_LINK_LENGTH = 512;
// C0 controls, DEL and C1 controls.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
// A "." or ".." path segment, also percent-encoded ("%2e", "%2E%2e", ...):
// URL parsers resolve these, so "/..//evil.com" normalises to "//evil.com".
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
const BASE = 'https://x.invalid';

// The path part of the link (before any ? or #).
function pathOf(link) {
    return link.split(/[?#]/, 1)[0];
}

// Belt and braces for the dot-segment check: after URL normalisation the
// link must still be a same-origin path that doesn't start with "//".
function normalisesOffOrigin(link) {
    try {
        const url = new URL(link, BASE);
        return url.origin !== BASE || url.pathname.startsWith('//');
    } catch {
        return true;
    }
}

function isValidDeepLink(link) {
    if (typeof link !== 'string') return false;
    if (link.length === 0 || link.length > MAX_DEEP_LINK_LENGTH) return false;
    if (link[0] !== '/') return false;
    if (link[1] === '/') return false;
    if (link.includes('\\')) return false;
    if (CONTROL_CHARS.test(link)) return false;
    if (pathOf(link).split('/').some(seg => DOT_SEGMENT.test(seg))) return false;
    if (normalisesOffOrigin(link)) return false;
    return true;
}

// The link itself when valid, otherwise null (callers store "no link").
function sanitizeDeepLink(link) {
    return isValidDeepLink(link) ? link : null;
}

module.exports = { isValidDeepLink, sanitizeDeepLink, MAX_DEEP_LINK_LENGTH };
