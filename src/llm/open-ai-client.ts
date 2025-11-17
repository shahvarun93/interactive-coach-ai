// src/llm/openaiClient.ts
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set in .env');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});