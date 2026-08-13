const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Clients ──
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
const cerebrasClient = new OpenAI({ apiKey: process.env.CEREBRAS_API_KEY || 'unset', baseURL: 'https://api.cerebras.ai/v1' });
const geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiFlashLite = geminiAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

// ── NIM client (NVIDIA NIM — OpenAI-compatible API) ──
const nimClient = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY || 'unset', baseURL: 'https://integrate.api.nvidia.com/v1' });

// ── Model constants ──
const MODELS = {
    GPT_OSS_120B: 'openai/gpt-oss-120b',
    GPT_OSS_20B:  'openai/gpt-oss-20b',
    QWEN27B:      'qwen/qwen3.6-27b',
    DEEPSEEK: 'deepseek-r1-distill-llama-70b',
    DEEPSEEK_V4_FLASH: 'deepseek-ai/deepseek-v4-flash',
    MINIMAX_M27:       'minimaxai/minimax-m2.7',
    NEMOTRON_49B:      'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    LLAMA_3B:          'meta/llama-3.2-3b-instruct',
    LLAMA_VISION_11B:  'meta/llama-3.2-11b-vision-instruct',
};

const CEREBRAS_MODEL = 'llama-3.3-70b';
const DEFAULT_NIM_MODEL = MODELS.DEEPSEEK_V4_FLASH;

// Groq's reasoning models spend part of their token budget on hidden reasoning
// (a separate `message.reasoning` field, not `content`) before ever writing a
// visible answer -- left at Groq's default, this has been observed exhausting
// max_tokens entirely and returning a non-null EMPTY `content` (confirmed by
// direct probe: gpt-oss-120b burned 315-318 of a 320 token budget on reasoning
// alone). Dialing reasoning down keeps the visible answer well within normal
// budgets instead of relying on the empty-content throw below to fail over.
// gpt-oss models accept low/medium/high (default is much higher than 'low');
// Qwen 3.6 only accepts 'none' or 'default' -- any other value 400s, and its
// 'default' reasoning is inline `<think>` tags in `content` rather than a
// separate field, so it can ALSO exhaust max_tokens mid-thought. Only applies
// to the Groq leg: Cerebras runs a fixed non-reasoning model and NIM models
// haven't been confirmed to accept this parameter the same way.
const GROQ_REASONING_EFFORT = {
    [MODELS.GPT_OSS_120B]: 'low',
    [MODELS.GPT_OSS_20B]: 'low',
    [MODELS.QWEN27B]: 'none',
};

// ── Fixed text-route failover order ──
// Every text route attempts providers in this order. `model` on a route entry
// is the model used for the Groq attempt; `nimModel` (if set) overrides the
// model used for the final NIM attempt — both Cerebras and Gemini Flash-Lite
// use a fixed model regardless of route, per provider contract.
const TEXT_CHAIN = ['groq', 'cerebras', 'gemini', 'nim'];

// ── Route config ──
const ROUTES = {
    'chat':               { model: MODELS.GPT_OSS_120B, maxTokens: 1000, temp: 0.3 },
    'pdf-import':         { model: MODELS.GPT_OSS_120B, maxTokens: 4000, temp: 0 },
    'cams-import':        { model: MODELS.GPT_OSS_120B, maxTokens: 6000, temp: 0 },
    'forecast-insight':   { model: MODELS.GPT_OSS_120B, nimModel: MODELS.LLAMA_3B, maxTokens: 256,  temp: 0.5 },
    'salary-allocation':  { model: MODELS.GPT_OSS_120B, nimModel: MODELS.DEEPSEEK_V4_FLASH, maxTokens: 1024, temp: 0.4 },
    'personality':        { model: MODELS.GPT_OSS_120B, nimModel: MODELS.NEMOTRON_49B,      maxTokens: 2048, temp: 0.7 },
    'report':             { model: MODELS.GPT_OSS_120B,          maxTokens: 400,  temp: 0.6 },
    'forecast':           { model: MODELS.QWEN27B,  maxTokens: 1600, temp: 0.5 },
    'salary-intelligence':{ model: MODELS.GPT_OSS_120B, nimModel: MODELS.DEEPSEEK_V4_FLASH, maxTokens: 1024, temp: 0.4 },
    'parse-sms':          { model: MODELS.GPT_OSS_20B,  maxTokens: 300,  temp: 0.1 },
    'quick-add':          { model: MODELS.GPT_OSS_20B,  maxTokens: 300,  temp: 0.1 },
    'recurring':          { model: MODELS.GPT_OSS_120B, nimModel: MODELS.DEEPSEEK_V4_FLASH, maxTokens: 1024, temp: 0.3 },
    // Additional routes
    'afford':             { model: MODELS.GPT_OSS_120B, nimModel: MODELS.DEEPSEEK_V4_FLASH, maxTokens: 512,  temp: 0.3 },
    'parse-split':        { model: MODELS.GPT_OSS_20B,  maxTokens: 300,  temp: 0.1 },
    'life-event':         { model: MODELS.GPT_OSS_120B, nimModel: MODELS.MINIMAX_M27,       maxTokens: 2048, temp: 0.5 },
    'forecast-calendar':  { model: MODELS.QWEN27B,  maxTokens: 2000, temp: 0.5 },
    'health-report':      { model: MODELS.GPT_OSS_120B, nimModel: MODELS.MINIMAX_M27,       maxTokens: 2048, temp: 0.5 },
    'agent-chat':         { model: MODELS.GPT_OSS_120B, nimModel: MODELS.NEMOTRON_49B,      maxTokens: 2048, temp: 0.7 },
    'briefing':           { model: MODELS.GPT_OSS_120B, nimModel: MODELS.MINIMAX_M27,       maxTokens: 300,  temp: 0.6 },
    // maxTokens is generous relative to the ~65-word output: gpt-oss-120b spends
    // 200-300+ tokens on hidden reasoning before writing any visible content
    // (confirmed by direct probe against the Groq API), so a budget close to the
    // visible word count starves it and returns empty content (see the
    // content.trim() === '' check in openAiCompatibleComplete above).
    'daily-briefing':     { model: MODELS.GPT_OSS_120B, nimModel: MODELS.MINIMAX_M27,       maxTokens: 700,  temp: 0.6 },
    'behavioral-insight': { model: MODELS.GPT_OSS_120B,          maxTokens: 400,  temp: 0.7 },
    'planning-narrative': { model: MODELS.GPT_OSS_120B, nimModel: MODELS.DEEPSEEK_V4_FLASH, maxTokens: 900,  temp: 0.4 },
};

// ── Circuit breaker (in-memory, resets on restart) ──
const COOLDOWN_MS = 60 * 1000;
const cooldownUntil = {};

const isCoolingDown = (provider) => {
    const until = cooldownUntil[provider];
    if (!until) return false;
    if (Date.now() < until) return true;
    // Cooldown window has expired — clear it and announce the provider is back.
    delete cooldownUntil[provider];
    console.log(`[AI] ${provider} cooldown expired, resuming normal attempts`);
    return false;
};

const triggerCooldown = (provider) => {
    if (cooldownUntil[provider]) return; // already cooling down
    cooldownUntil[provider] = Date.now() + COOLDOWN_MS;
    console.warn(`[AI] ${provider} hit a rate limit — cooling down for ${COOLDOWN_MS / 1000}s`);
};

// ── Timeout wrapper ──
const TIMEOUT_MS = 8000;
const withTimeout = (promise, ms) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// ── Check if error is a rate limit ──
const isRateLimit = (err) =>
    err?.status === 429 ||
    err?.response?.status === 429 ||
    err?.message?.includes('429') ||
    err?.message?.includes('rate_limit') ||
    err?.message?.includes('quota') ||
    err?.message?.includes('Rate limit');

// ── OpenAI-compatible chat completion (Groq, Cerebras, NIM) ──
const openAiCompatibleComplete = async (client, model, messages, maxTokens, temp, reasoningEffort) => {
    const res = await client.chat.completions.create({
        model,
        messages: Array.isArray(messages)
            ? messages
            : [{ role: 'user', content: messages }],
        max_tokens: maxTokens,
        temperature: temp,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    });
    const content = res.choices[0].message.content;
    if (content == null || content.trim() === '') {
        // Reasoning models can exhaust max_tokens on hidden reasoning before ever
        // writing to `content`. Some (NVIDIA Nemotron via NIM) surface this as a
        // null content field; Groq's gpt-oss models surface it differently -- a
        // separate `message.reasoning` field gets the full token budget and
        // `content` comes back as a non-null EMPTY STRING with finish_reason
        // 'length'. The old `content == null` check only caught the first shape,
        // so gpt-oss silently "succeeded" with blank text instead of failing over.
        throw new Error('Empty completion content (likely truncated reasoning output)');
    }
    return content;
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

    const result = await geminiFlashLite.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: temp,
        },
    });
    return result.response.text();
};

// ── Execute on a specific provider in the text failover chain ──
const executeOnProvider = async (provider, config, messages, maxTokens, temp) => {
    if (provider === 'gemini') {
        return await geminiComplete(messages, maxTokens, temp);
    }
    if (provider === 'cerebras') {
        if (!process.env.CEREBRAS_API_KEY) throw new Error('CEREBRAS_API_KEY not configured');
        return await openAiCompatibleComplete(cerebrasClient, CEREBRAS_MODEL, messages, maxTokens, temp);
    }
    if (provider === 'nim') {
        if (!process.env.NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not configured');
        return await openAiCompatibleComplete(nimClient, config.nimModel || DEFAULT_NIM_MODEL, messages, maxTokens, temp);
    }
    // groq
    const groqModel = config.model || MODELS.GPT_OSS_120B;
    return await openAiCompatibleComplete(groqClient, groqModel, messages, maxTokens, temp, GROQ_REASONING_EFFORT[groqModel]);
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

// ── Strip ```json ... ``` markdown fences some models wrap output in ──
const stripCodeFences = (text) => text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

// ── Normalize raw provider output into one consistent shape ──
const normalize = (raw) => stripCodeFences(stripThinkTags(raw));

// ── Main unified function ──
const aiComplete = async (routeKey, messages, overrides = {}) => {
    const config = ROUTES[routeKey];
    if (!config) throw new Error(`Unknown AI route: ${routeKey}`);

    const maxTokens = overrides.maxTokens || config.maxTokens;
    const temp      = overrides.temperature !== undefined ? overrides.temperature : config.temp;

    let lastError;
    for (const provider of TEXT_CHAIN) {
        if (isCoolingDown(provider)) {
            console.log(`[AI] Skipping ${provider} for '${routeKey}' (cooling down)`);
            continue;
        }

        try {
            const raw = await withTimeout(
                executeOnProvider(provider, config, messages, maxTokens, temp),
                TIMEOUT_MS,
            );
            const result = normalize(raw);
            console.log(`[AI] Route '${routeKey}' served by ${provider}`);
            return result;
        } catch (err) {
            if (isRateLimit(err)) triggerCooldown(provider);
            console.warn(`[AI] ${provider} failed for '${routeKey}' (${err.message}), trying next...`);
            lastError = err;
            continue;
        }
    }

    // All providers exhausted — return a predictable, catchable error rather
    // than letting an opaque provider error bubble up to the caller.
    console.error(`[AI] All providers exhausted for route '${routeKey}'`);
    const exhaustedError = new Error('All AI providers exhausted');
    exhaustedError.aiProvidersExhausted = true;
    exhaustedError.userMessage = 'AI is temporarily busy, please try again in a moment.';
    exhaustedError.cause = lastError;
    throw exhaustedError;
};

module.exports = { aiComplete, MODELS, ROUTES, nimClient, openAiCompatibleComplete };
