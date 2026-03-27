const Groq = require('groq-sdk');

const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
].filter(Boolean);

let keyIndex = 0;

const getClient = () => {
    const key = keys[keyIndex % keys.length];
    keyIndex++;
    return new Groq({ apiKey: key });
};

const MODELS = {
    quality: 'llama-3.3-70b-versatile',  // heavy, complex tasks
    fast:    'llama-3.1-8b-instant',       // light, simple tasks
};

const chatCompletion = async (messages, { model = 'fast', maxTokens = 1000, temperature = 0.7, jsonMode = false } = {}) => {
    const client = getClient();
    const params = {
        model: MODELS[model] || model,
        messages,
        max_tokens: maxTokens,
        temperature,
    };
    if (jsonMode) params.response_format = { type: 'json_object' };
    const response = await client.chat.completions.create(params);
    return response.choices[0].message.content;
};

module.exports = { chatCompletion, MODELS, getClient };
