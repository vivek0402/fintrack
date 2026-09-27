import { LOCKED_ATTR, LOCK_BG_AT_KEY, LOCK_SESSION_KEY, LOCK_SETTINGS_KEY } from './appLock';

// Auth store's persist key (store/authStore.ts); zustand saves { state: {...} }.
const AUTH_KEY = 'fintrack-auth';

/**
 * Inlined into <head> by app/layout.tsx and run before first paint, long
 * before React: if the app lock will engage, hide app content right away so a
 * cold start never flashes balances. It is the same decision as
 * shouldLockOnPageLoad() minus the native check (lock settings are only ever
 * written inside the Android app); lockHeadScript.test.ts runs this exact
 * string against that function over a matrix of storage states.
 * AppLockGate re-decides on mount and lifts the attribute if it isn't needed.
 */
export const LOCK_HEAD_SCRIPT = `
try {
  var l = JSON.parse(localStorage.getItem(${JSON.stringify(LOCK_SETTINGS_KEY)}) || 'null');
  var a = JSON.parse(localStorage.getItem(${JSON.stringify(AUTH_KEY)}) || 'null');
  var t = Number(localStorage.getItem(${JSON.stringify(LOCK_BG_AT_KEY)}));
  var backgrounded = isFinite(t) && t > 0;
  var reload = sessionStorage.getItem(${JSON.stringify(LOCK_SESSION_KEY)}) === '1' && !backgrounded;
  if (l && l.enabled === true && a && a.state && a.state.token && !reload) {
    document.documentElement.setAttribute(${JSON.stringify(LOCKED_ATTR)}, '');
  }
} catch (e) {}
`;
