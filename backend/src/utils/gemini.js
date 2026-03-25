const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

const getVisionModel = () => genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
const getGroqClient = () => groqClient;
const getModel = () => groqClient; // backward compat — returns Groq client

module.exports = { getModel, getVisionModel, getGroqClient };
