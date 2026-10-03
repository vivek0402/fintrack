import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// <main> is a flex: 1 item in the shell's row. Flex items don't shrink below
// their content's min width by default, and overflow-x: clip (unlike hidden)
// doesn't change that -- so without min-width: 0 a wide chart stretched <main>
// past the phone screen and clip hid the right edge (Analytics on mobile).

const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

describe('.app-main', () => {
    it('can shrink below its content width, so pages never overflow the viewport', () => {
        const rule = css.match(/\n\.app-main\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule).toMatch(/flex:\s*1/);
        expect(rule).toMatch(/min-width:\s*0/);
    });
});
