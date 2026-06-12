const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const { nimClient, MODELS } = require('./ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Vision model wrapper — tries NIM Llama 3.2 11B Vision first, falls back to
// Gemini if NVIDIA_API_KEY is missing or the NIM call fails. Preserves the
// genAI.generateContent(parts) -> { response: { text() } } contract used by
// routes/ai.js (parts = [{ inlineData: { data, mimeType } }, { text }]).
const getVisionModel = () => ({
    generateContent: async (parts) => {
        const inlinePart = parts.find(p => p.inlineData);
        const textPart = parts.find(p => p.text);

        if (process.env.NVIDIA_API_KEY) {
            try {
                const res = await nimClient.chat.completions.create({
                    model: MODELS.LLAMA_VISION_11B,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: `data:${inlinePart.inlineData.mimeType};base64,${inlinePart.inlineData.data}` } },
                            { type: 'text', text: textPart.text },
                        ],
                    }],
                    max_tokens: 1024,
                    temperature: 0.2,
                });
                const content = res.choices[0].message.content;
                return { response: { text: () => content } };
            } catch (err) {
                console.warn('[Vision] NIM vision failed, falling back to Gemini:', err.message);
            }
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        return model.generateContent(parts);
    },
});

const getGroqClient = () => groqClient;
const getModel = () => groqClient; // backward compat — returns Groq client

module.exports = { getModel, getVisionModel, getGroqClient };
