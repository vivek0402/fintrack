const { isValidDeepLink, sanitizeDeepLink, MAX_DEEP_LINK_LENGTH } = require('../src/utils/deepLink');

// Every one of these must be refused.
const ATTACKS = [
    '//evil.com',
    '//evil.com/accounts',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'http://evil.com',
    'https://evil.com/accounts',
    'intent://scan/#Intent;scheme=zxing;end',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
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
    '/' + 'a'.repeat(MAX_DEEP_LINK_LENGTH),
];

describe('isValidDeepLink', () => {
    test.each([
        '/', '/accounts', '/transactions', '/budgets', '/goals', '/recurring', '/analytics', '/dashboard',
        '/accounts?card=7', '/transactions#tx-1', '/personal-loans/detail?id=3',
        '/accounts?next=/..//x', '/transactions#/../x', '/a..b', '/.well-known',
    ])('accepts internal path %j', (link) => {
        expect(isValidDeepLink(link)).toBe(true);
    });

    test.each(ATTACKS)('rejects %j', (link) => {
        expect(isValidDeepLink(link)).toBe(false);
    });

    test.each([null, undefined, 42, {}, ['/accounts']])('rejects non-string %p', (link) => {
        expect(isValidDeepLink(link)).toBe(false);
    });
});

describe('sanitizeDeepLink', () => {
    test('returns valid links unchanged and invalid ones as null', () => {
        expect(sanitizeDeepLink('/accounts')).toBe('/accounts');
        expect(sanitizeDeepLink('javascript:alert(1)')).toBeNull();
        expect(sanitizeDeepLink('//evil.com')).toBeNull();
    });
});

