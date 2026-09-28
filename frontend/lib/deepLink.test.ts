import { describe, it, expect } from 'vitest';
import { isValidDeepLink, safeDeepLink, DEEP_LINK_FALLBACK } from './deepLink';

const VALID = [
  '/', '/accounts', '/transactions', '/budgets', '/goals', '/recurring', '/analytics', '/dashboard',
  '/accounts?card=7', '/transactions#tx-1',
  '/accounts?next=/..//x', '/transactions#/../x', '/a..b', '/.well-known',
];

const ATTACKS = [
  '//evil.com',
  '//evil.com/accounts',
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'http://evil.com',
  'https://evil.com/accounts',
  'intent://scan/#Intent;scheme=zxing;end',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  '/\\evil.com',
  '\\\\evil.com',
  '/accounts\\..\\x',
  '/\t/evil.com',
  '/\n/evil.com',
  '/accounts\r\n',
  '/acc\u0000ounts',
  '/acc\u007Founts',
  '/acc\u0085ounts',
  '/..//evil.com',
  '/.//x',
  '/%2e%2e//evil.com',
  '/%2E.//evil.com',
  '/a/../..//evil.com',
  '/accounts/..',
  '/accounts/./x',
  ' /accounts',
  'accounts',
  '',
  '/' + 'a'.repeat(512),
];

describe('isValidDeepLink', () => {
  it.each(VALID)('accepts internal path %j', (link) => {
    expect(isValidDeepLink(link)).toBe(true);
  });

  it.each(ATTACKS)('rejects %j', (link) => {
    expect(isValidDeepLink(link)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ['/accounts']])('rejects non-string %p', (link) => {
    expect(isValidDeepLink(link)).toBe(false);
  });
});

describe('safeDeepLink', () => {
  it.each(VALID)('keeps %j', (link) => {
    expect(safeDeepLink(link)).toBe(link);
  });

  it.each(ATTACKS)('falls back to the dashboard for %j', (link) => {
    expect(safeDeepLink(link)).toBe(DEEP_LINK_FALLBACK);
    expect(DEEP_LINK_FALLBACK).toBe('/dashboard');
  });
});
