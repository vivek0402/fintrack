// Notification deep links come from push payloads and the server's bell rows,
// so treat them as untrusted before navigating. A valid link is an internal
// app path: it starts with exactly one "/", and has no backslash (browsers
// read "\" as "/", so "/\evil.com" is protocol-relative) and no control
// characters (URL parsers strip tabs/newlines, turning "/\t/evil.com" into
// "//evil.com"), and no "." / ".." path segments ("/..//x" normalises to
// "//x"). That rules out "//host" and every scheme ("javascript:", "http:",
// "intent:", "data:", ...).
// Mirrors backend/src/utils/deepLink.js; keep the two in sync.

export const DEEP_LINK_FALLBACK = '/dashboard';
const MAX_DEEP_LINK_LENGTH = 512;
// C0 controls, DEL and C1 controls.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
// A "." or ".." path segment, also percent-encoded ("%2e", "%2E%2e", ...):
// URL parsers resolve these, so "/..//evil.com" normalises to "//evil.com".
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
const BASE = 'https://x.invalid';

// The path part of the link (before any ? or #).
function pathOf(link: string): string {
  return link.split(/[?#]/, 1)[0];
}

// Belt and braces for the dot-segment check: after URL normalisation the
// link must still be a same-origin path that doesn't start with "//".
function normalisesOffOrigin(link: string): boolean {
  try {
    const url = new URL(link, BASE);
    return url.origin !== BASE || url.pathname.startsWith('//');
  } catch {
    return true;
  }
}

export function isValidDeepLink(link: unknown): link is string {
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

// Where to navigate for a notification's link: the link itself when valid,
// otherwise the dashboard (so a tap still lands somewhere sensible).
export function safeDeepLink(link: unknown): string {
  return isValidDeepLink(link) ? link : DEEP_LINK_FALLBACK;
}
