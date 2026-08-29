import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// A routing contract that spans files and nothing else enforces.
//
// Eleven routes are thin `redirect()` stubs pointing at a tabbed page with a
// `?tab=` value (e.g. /recurring -> /budgets?tab=recurring). Each target page
// resolves that value against its own list of tab keys and, when the value is
// not recognised, silently falls back to its default tab. So renaming a tab key
// does not throw, does not fail a build and does not fail a type check -- the
// user simply clicks "Recurring" in the nav and lands on "Budgets".
//
// These read the real source at test time rather than restating the routes, so
// they stay true as routes are added or renamed.

const APP = join(process.cwd(), 'app');

/** Route dirs holding a `page.tsx`. */
function routeDirs(): string[] {
    return readdirSync(APP, { withFileTypes: true })
        .filter(d => d.isDirectory() && existsSync(join(APP, d.name, 'page.tsx')))
        .map(d => d.name);
}

const source = (route: string) => readFileSync(join(APP, route, 'page.tsx'), 'utf8');

/** Redirect stubs and the path they point at. */
function redirects(): { from: string; to: string }[] {
    return routeDirs()
        .map(r => ({ from: r, to: (source(r).match(/redirect\('([^']+)'\)/) ?? [])[1] }))
        .filter((x): x is { from: string; to: string } => !!x.to);
}

/**
 * Every tab key a page will accept: object literals (`key: 'loans'`) plus any
 * deep-link-only string arrays, which Analytics uses for the three tabs that
 * have no pill of their own (EXTRA_TABS).
 */
function acceptedTabKeys(route: string): string[] {
    const src = source(route);
    const fromObjects = [...src.matchAll(/key:\s*'([a-z0-9-]+)'/gi)].map(m => m[1]);
    const fromExtras = [...src.matchAll(/EXTRA_TABS\s*=\s*\[([^\]]*)\]/g)]
        .flatMap(m => [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1]));
    return [...new Set([...fromObjects, ...fromExtras])];
}

describe('redirect stubs', () => {
    it('finds the expected set of them', () => {
        // Guards the tests below against silently covering nothing if the
        // parsing ever stops matching.
        expect(redirects().length).toBeGreaterThanOrEqual(10);
    });

    it('points every stub at a route that exists', () => {
        const dirs = routeDirs();
        for (const { from, to } of redirects()) {
            const target = to.replace(/^\//, '').split('?')[0];
            expect(dirs, `/${from} redirects to /${target}, which has no page`).toContain(target);
        }
    });

    it('only ever redirects to a tab its target page actually accepts', () => {
        const withTab = redirects().filter(r => r.to.includes('?tab='));
        expect(withTab.length).toBeGreaterThan(0);

        for (const { from, to } of withTab) {
            const target = to.replace(/^\//, '').split('?')[0];
            const tab = to.split('tab=')[1];
            expect(
                acceptedTabKeys(target),
                `/${from} sends users to ?tab=${tab}, but /${target} does not list that key — ` +
                `the page would silently fall back to its default tab`,
            ).toContain(tab);
        }
    });

    it('keeps stubs thin, so they stay pure redirects', () => {
        for (const { from } of redirects()) {
            expect(source(from).split('\n').length).toBeLessThan(12);
        }
    });
});

describe('tabbed pages', () => {
    const tabbed = () => routeDirs().filter(r => source(r).includes("searchParams.get('tab')"));

    it('always resolves an unknown ?tab= to a default rather than rendering nothing', () => {
        // Each of these guards the URL value against its own key list before
        // using it. Without that guard a stale bookmark would render a page
        // with no active tab at all.
        for (const route of tabbed()) {
            const src = source(route);
            const guarded = /TABS\.some\(|ALL_TAB_KEYS\.includes\(/.test(src);
            expect(guarded, `/${route} uses ?tab= but does not validate it against its tab keys`).toBe(true);
        }
    });

    it('covers the pages the redirects actually target', () => {
        const targets = new Set(
            redirects().filter(r => r.to.includes('?tab=')).map(r => r.to.replace(/^\//, '').split('?')[0]),
        );
        for (const t of targets) expect(tabbed()).toContain(t);
    });
});
