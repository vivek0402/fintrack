const TIMEOUT_MS = 6000;

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`mfapi timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// GET https://api.mfapi.in/mf/search?q={name} -> [{schemeCode, schemeName}, ...]
async function searchSchemes(query) {
    if (!query || query.trim().length < 2) return [];
    try {
        const res = await withTimeout(
            fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query.trim())}`),
            TIMEOUT_MS
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data.slice(0, 20) : [];
    } catch (err) {
        console.warn('[MarketData] searchSchemes failed:', err.message);
        return [];
    }
}

// GET https://api.mfapi.in/mf/{schemeCode} -> {meta, data:[{date,nav}...]} newest-first
async function getLatestNav(schemeCode) {
    if (!schemeCode) return null;
    try {
        const res = await withTimeout(
            fetch(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`),
            TIMEOUT_MS
        );
        if (!res.ok) return null;
        const json = await res.json();
        const latest = json?.data?.[0];
        if (!latest || !latest.nav) return null;
        return {
            schemeCode: String(schemeCode),
            schemeName: json.meta?.scheme_name || null,
            nav: parseFloat(latest.nav),
            navDate: latest.date,
        };
    } catch (err) {
        console.warn(`[MarketData] getLatestNav(${schemeCode}) failed:`, err.message);
        return null;
    }
}

module.exports = { searchSchemes, getLatestNav };
