// The backend validates health-report input against its own copy of the score's
// factor ids and maxes. They must match frontend/lib/healthScore.ts exactly, or a
// legitimate score would be rejected (or a bogus one accepted).
const fs = require('fs');
const path = require('path');
const { HEALTH_FACTORS } = require('../src/utils/healthReport');

const FRONTEND_LIB = path.join(__dirname, '..', '..', 'frontend', 'lib', 'healthScore.ts');

function frontendFactors() {
    const src = fs.readFileSync(FRONTEND_LIB, 'utf8');
    const re = /\{\s*id:\s*'([a-z]+)',\s*name:\s*'([^']+)',[^}]*?\bmax:\s*(\d+)/g;
    const out = {};
    for (const m of src.matchAll(re)) out[m[1]] = { name: m[2], max: Number(m[3]) };
    return out;
}

describe('health factor definitions', () => {
    test('backend HEALTH_FACTORS match the frontend calculateHealthScore factors', () => {
        const fe = frontendFactors();
        expect(Object.keys(fe).length).toBe(8);
        const be = Object.fromEntries(
            Object.entries(HEALTH_FACTORS).map(([id, f]) => [id, { name: f.name, max: f.max }])
        );
        expect(be).toEqual(fe);
    });

    test('factor maxes add up to 100', () => {
        const total = Object.values(HEALTH_FACTORS).reduce((s, f) => s + f.max, 0);
        expect(total).toBe(100);
    });
});
