// src/services/systemDesignAI.service.ts
import { openai } from '../llm/open-ai-client';
import { GeneratedSDQuestion } from '../interfaces/GeneratedSDQuestion';  

export async function generateSystemDesignQuestion(
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): Promise<GeneratedSDQuestion> {
  const systemPrompt = `
You are a senior backend engineer interviewing candidates for FAANG-style system design roles.
Generate ONE realistic system design interview question.

Requirements:
- Tailor it to the given difficulty: easy, medium, or hard.
- Focus on web-scale backends (feeds, messaging, search, payments, etc.).
- Do NOT answer the question, only ask it.
- Do NOT include any extra explanation, intro, or bullets.
Return exactly the question text only.
`;

  const userPrompt = `Generate a ${difficulty} system design question.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini', // or any available model in your account
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  });

  const question =
    response.choices[0]?.message?.content?.trim() ??
    'Design a URL shortener like TinyURL for 100M daily active users.';

  return {
    question,
    difficulty,
  };
}