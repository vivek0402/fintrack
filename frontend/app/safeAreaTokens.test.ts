import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// The Android WebView reports env(safe-area-inset-*) as 0; Capacitor's
// SystemBars plugin writes the real insets onto <html> as --safe-area-inset-*
// instead. The --sa-* tokens read that variable first and fall back to env()
// (web, iOS), so every inset in the app has to go through them.

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

function tokenValue(name: string): string | undefined {
    const m = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    return m?.[1].trim();
}

describe('safe-area tokens', () => {
    it.each(SIDES)('--sa-%s prefers the Capacitor variable, then env(), then 0px', (side) => {
        expect(tokenValue(`--sa-${side}`)).toBe(
            `var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px))`,
        );
    });

    it('pads the body with the tokens, so content starts below the status bar', () => {
        const body = css.match(/\nbody\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(body).toMatch(/padding-top:\s*var\(--sa-top\)/);
        expect(body).toMatch(/padding-bottom:\s*var\(--sa-bottom\)/);
    });

    it('nothing outside the token definitions reads env(safe-area-inset-*) directly', () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === 'node_modules' || name.startsWith('.')) continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) { walk(path); continue; }
                if (!/\.(tsx?|css)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
                readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
                    if (!/env\(safe-area-inset/.test(line)) return;
                    if (/^\s*--sa-(top|right|bottom|left):/.test(line) || /^\s*(\/\*|\*|\/\/)/.test(line)) return;
                    offenders.push(`${relative(ROOT, path)}:${i + 1}`);
                });
            }
        };
        for (const dir of ['app', 'components', 'lib', 'store', 'hooks']) {
            try { walk(join(ROOT, dir)); } catch { /* dir absent */ }
        }
        expect(offenders).toEqual([]);
    });
});
