// Phase 0 of docs/GROWTH_BRIEF_10000X.md ("The Assignment"): compares edit and
// delete rates across transaction sources (manual/sms/cams_import/pdf_import)
// to find out whether the real adoption blocker is entry friction (manual is
// fine, imports would help) or trust in auto-capture (imports get corrected
// or deleted more than manual entries do).
// Run with: node backend/scripts/source-trust-report.js
//
// Needs at least 2-4 weeks of data after migrations 053/054 ship before the
// rates are meaningful -- run too early and you're reading noise.

const pool = require('../src/db/pool');

async function main() {
    const editRes = await pool.query(`
        SELECT source,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE updated_at > created_at) AS edited
        FROM transactions
        GROUP BY source
        ORDER BY total DESC
    `);

    const stillPresentRes = await pool.query(`SELECT source, COUNT(*) AS total FROM transactions GROUP BY source`);
    const deletedRes = await pool.query(`SELECT source, COUNT(*) AS total FROM transaction_deletions GROUP BY source`);

    const deleteBySource = {};
    for (const row of stillPresentRes.rows) {
        deleteBySource[row.source] = { stillPresent: parseInt(row.total, 10), deleted: 0 };
    }
    for (const row of deletedRes.rows) {
        const existing = deleteBySource[row.source] || { stillPresent: 0, deleted: 0 };
        existing.deleted = parseInt(row.total, 10);
        deleteBySource[row.source] = existing;
    }

    console.log('\n=== Source trust report (Phase 0 — The Assignment) ===\n');
    console.log('Source        | Total | Edited | Edit rate | Deleted | Ever created | Delete rate');
    console.log('-------------- ------- -------- ----------- --------- -------------- ------------');

    for (const row of editRes.rows) {
        const total = parseInt(row.total, 10);
        const edited = parseInt(row.edited, 10);
        const editRate = total > 0 ? ((edited / total) * 100).toFixed(1) : '0.0';

        const d = deleteBySource[row.source] || { stillPresent: total, deleted: 0 };
        const everCreated = d.stillPresent + d.deleted;
        const deleteRate = everCreated > 0 ? ((d.deleted / everCreated) * 100).toFixed(1) : '0.0';

        console.log(
            `${row.source.padEnd(14)} ${String(total).padEnd(6)} ${String(edited).padEnd(7)} ${editRate.padStart(9)}% ${String(d.deleted).padEnd(8)} ${String(everCreated).padEnd(14)} ${deleteRate.padStart(10)}%`
        );
    }

    console.log('\nLow sample sizes (under ~30) make these rates unreliable -- treat as directional only.\n');
}

main()
    .catch(err => {
        console.error('Error:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
