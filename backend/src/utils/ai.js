const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Groq clients ──
const groqClient1 = new Groq({ apiKey: process.env.GROQ_API_KEY });
const groqClient2 = new Groq({ apiKey: process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY });

// ── Gemini client ──
const geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiFlash = geminiAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// ── Model constants ──
const MODELS = {
    LLAMA70B: 'llama-3.3-70b-versatile',
    LLAMA4:   'meta-llama/llama-4-scout-17b-16e-instruct',
    LLAMA8B:  'llama-3.1-8b-instant',
    QWEN32B:  'qwen/qwen3-32b',
    DEEPSEEK: 'deepseek-r1-distill-llama-70b',
};

// ── Route config ──
// provider: 'groq1' | 'groq2' | 'gemini'
const ROUTES = {
    'chat':               { provider: 'groq1', model: MODELS.LLAMA70B, maxTokens: 600,  temp: 0.3 },
    'salary-allocation':  { provider: 'gemini',                        maxTokens: 1200, temp: 0.4 },
    'personality':        { provider: 'groq1', model: MODELS.LLAMA4,   maxTokens: 1000, temp: 0.5 },
    'report':             { provider: 'groq2', model: MODELS.LLAMA4,   maxTokens: 800,  temp: 0.5 },
    'forecast':           { provider: 'groq1', model: MODELS.QWEN32B,  maxTokens: 1600, temp: 0.5 },
    'salary-intelligence':{ provider: 'groq2', model: MODELS.LLAMA4,   maxTokens: 800,  temp: 0.4 },
    'parse-sms':          { provider: 'groq1', model: MODELS.LLAMA8B,  maxTokens: 300,  temp: 0.1 },
    'quick-add':          { provider: 'groq2', model: MODELS.LLAMA8B,  maxTokens: 300,  temp: 0.1 },
    'recurring':          { provider: 'groq2', model: MODELS.LLAMA8B,  maxTokens: 700,  temp: 0.3 },
    'tax-estimate':       { provider: 'groq1', model: MODELS.LLAMA4,   maxTokens: 900,  temp: 0.3 },
    // Additional routes
    'afford':             { provider: 'groq2', model: MODELS.LLAMA8B,  maxTokens: 400,  temp: 0.3 },
    'parse-split':        { provider: 'groq1', model: MODELS.LLAMA8B,  maxTokens: 300,  temp: 0.1 },
    'regret-patterns':    { provider: 'groq2', model: MODELS.LLAMA8B,  maxTokens: 500,  temp: 0.4 },
    'life-event':         { provider: 'groq1', model: MODELS.LLAMA4,   maxTokens: 600,  temp: 0.4 },
    'forecast-calendar':  { provider: 'groq1', model: MODELS.QWEN32B,  maxTokens: 600,  temp: 0.5 },
    'health-report':      { provider: 'groq2', model: MODELS.LLAMA4,   maxTokens: 600,  temp: 0.4 },
};

// ── Fallback chain per provider ──
const FALLBACK_CHAIN = {
    'groq1':  ['groq2',  'gemini'],
    'groq2':  ['groq1',  'gemini'],
    'gemini': ['groq1',  'groq2'],
};

// ── Groq completion ──
const groqComplete = async (client, model, messages, maxTokens, temp) => {
    const res = await client.chat.completions.create({
        model,
        messages: Array.isArray(messages)
            ? messages
            : [{ role: 'user', content: messages }],
        max_tokens: maxTokens,
        temperature: temp,
    });
    return res.choices[0].message.content;
};

// ── Gemini completion ──
const geminiComplete = async (messages, maxTokens, temp) => {
    const prompt = Array.isArray(messages)
        ? messages.map(m => {
            if (m.role === 'system') return `Instructions: ${m.content}`;
            if (m.role === 'user') return `User: ${m.content}`;
            if (m.role === 'assistant') return `Assistant: ${m.content}`;
            return m.content;
        }).join('\n\n')
        : messages;

    const result = await geminiFlash.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: temp,
        },
    });
    return result.response.text();
};

// ── Check if error is a rate limit ──
const isRateLimit = (err) =>
    err?.status === 429 ||
    err?.response?.status === 429 ||
    err?.message?.includes('429') ||
    err?.message?.includes('rate_limit') ||
    err?.message?.includes('quota') ||
    err?.message?.includes('Rate limit');

// ── Execute on a specific provider ──
const executeOnProvider = async (provider, model, messages, maxTokens, temp) => {
    if (provider === 'gemini') {
        return await geminiComplete(messages, maxTokens, temp);
    }
    const client = provider === 'groq1' ? groqClient1 : groqClient2;
    return await groqComplete(client, model, messages, maxTokens, temp);
};

// ── Strip <think>...</think> reasoning blocks (Qwen3, DeepSeek, etc.) ──
// Handles both complete blocks AND unclosed blocks (truncated by maxTokens)
const stripThinkTags = (text) => {
    // Remove complete <think>...</think> blocks
    let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Remove unclosed <think> block (model was cut off mid-reasoning)
    result = result.replace(/<think>[\s\S]*/gi, '');
    return result.trim();
};

// ── Main unified function ──
const aiComplete = async (routeKey, messages, overrides = {}) => {
    const config = ROUTES[routeKey];
    if (!config) throw new Error(`Unknown AI route: ${routeKey}`);

    const provider  = config.provider;
    const model     = config.model;
    const maxTokens = overrides.maxTokens || config.maxTokens;
    const temp      = overrides.temperature !== undefined ? overrides.temperature : config.temp;

    const fallbacks = FALLBACK_CHAIN[provider] || [];
    const chain = [provider, ...fallbacks];

    let lastError;
    for (const p of chain) {
        try {
            const fallbackModel =
                p === 'groq1' ? (model || MODELS.LLAMA4) :
                p === 'groq2' ? (model || MODELS.LLAMA4) :
                null; // gemini doesn't need a model string

            const raw = await executeOnProvider(p, fallbackModel, messages, maxTokens, temp);
            const result = stripThinkTags(raw);
            if (p !== provider) {
                console.log(`[AI] Route '${routeKey}' fell back from ${provider} → ${p}`);
            }
            return result;
        } catch (err) {
            if (isRateLimit(err)) {
                console.warn(`[AI] Rate limit on ${p} for '${routeKey}', trying next...`);
                lastError = err;
                continue;
            }
            // Non-rate-limit error — throw immediately
            throw err;
        }
    }

    // All providers exhausted
    console.error(`[AI] All providers exhausted for route '${routeKey}'`);
    throw lastError;
};

module.exports = { aiComplete, MODELS, ROUTES };
