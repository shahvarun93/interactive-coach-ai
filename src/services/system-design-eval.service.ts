// src/services/systemDesignEval.service.ts
import { SDEvaluation } from '../interfaces/SDEvaluation';
import { openai } from '../llm/open-ai-client';


export async function evaluateSystemDesignAnswer(
  prompt: string,
  answer: string
): Promise<SDEvaluation> {
  const systemPrompt = `
You are a principal engineer evaluating a candidate's system design interview answer.

You will be given:
- The original system design QUESTION
- The CANDIDATE_ANSWER

Your job:
- Score the answer from 0 to 10 for a senior software engineer:
  - 0-3: weak
  - 4-6: mixed/average
  - 7-8: strong
  - 9-10: exceptional
- Identify 2-4 concise strengths.
- Identify 2-4 concise weaknesses or areas to improve.

Return ONLY valid JSON in this exact shape:
{
  "score": number,
  "strengths": string[],
  "weaknesses": string[]
}
  `.trim();

  const userContent = `
QUESTION:
${prompt}

CANDIDATE_ANSWER:
${answer}
  `.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',   // adjust if you want a different model
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as SDEvaluation;

  return parsed;
}