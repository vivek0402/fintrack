process.env.JWT_SECRET = 'test-secret';
// utils/ai.js constructs real Groq/OpenAI/Gemini clients at require time; the
// Groq SDK throws if the key is missing. A dummy value is enough since these
// tests call openAiCompatibleComplete directly with a fake client, never the
// real one.
process.env.GROQ_API_KEY = 'test-groq-key';

const { openAiCompatibleComplete } = require('../src/utils/ai');

// Groq's gpt-oss models spend their token budget on hidden reasoning (a
// separate `message.reasoning` field) before ever writing to `content`. When
// the budget runs out mid-reasoning, `content` comes back as a non-null EMPTY
// STRING with finish_reason 'length' -- not `null`, which is the only shape
// NVIDIA Nemotron's equivalent failure mode used and the only shape the old
// check caught. An uncaught empty string here means a blank daily-brief
// narrative (and a blank push notification body) reaches the user with no
// error anywhere in the chain.
describe('openAiCompatibleComplete', () => {
    const fakeClient = (content) => ({
        chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content } }] }) } },
    });

    test('throws when content is an empty string (gpt-oss reasoning-budget exhaustion)', async () => {
        await expect(
            openAiCompatibleComplete(fakeClient(''), 'openai/gpt-oss-120b', 'hi', 320, 0.6)
        ).rejects.toThrow(/Empty completion content/);
    });

    test('throws when content is whitespace-only', async () => {
        await expect(
            openAiCompatibleComplete(fakeClient('   \n  '), 'openai/gpt-oss-120b', 'hi', 320, 0.6)
        ).rejects.toThrow(/Empty completion content/);
    });

    test('still throws when content is null (NIM reasoning-model failure mode)', async () => {
        await expect(
            openAiCompatibleComplete(fakeClient(null), 'nvidia/llama-3.3-nemotron-super-49b-v1.5', 'hi', 320, 0.6)
        ).rejects.toThrow(/Empty completion content/);
    });

    test('returns the content unchanged on a real answer', async () => {
        const result = await openAiCompatibleComplete(fakeClient('A real narrative.'), 'openai/gpt-oss-120b', 'hi', 320, 0.6);
        expect(result).toBe('A real narrative.');
    });
});
