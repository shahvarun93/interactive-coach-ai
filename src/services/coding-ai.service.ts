import { z } from "zod";
import { responsesClient } from "../infra/openaiClient";
import { CodingEvaluation } from "../interfaces/CodingEvaluation";
import { CodingDifficulty } from "../interfaces/CodingStats";

const QuestionSchema = z.object({
  question: z.string().min(1),
});

const EvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  correctness: z.enum(["correct", "partially_correct", "incorrect"]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  timeComplexity: z.string().min(1),
  spaceComplexity: z.string().min(1),
  summary: z.string().min(1),
  suggestions: z.array(z.string()).default([]),
});

export async function generateCodingQuestion(args: {
  topic: string;
  difficulty: CodingDifficulty;
}): Promise<string> {
  const systemPrompt = `
You are a senior software engineer generating coding interview questions.
- Return one question only.
- No solution, no hints, no extra text.
- Keep it realistic for FAANG-style interviews.
- Match the requested difficulty and topic.
Return JSON: {"question":"..."}
`.trim();

  const userPrompt = `Generate a ${args.difficulty} coding interview question about ${args.topic}.`;

  const payload = await responsesClient.openAiClientJsonResponse({
    model: "gpt-5",
    temperature: 0.8,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    schema: QuestionSchema,
  });

  return payload.question.trim();
}

export async function evaluateCodingSubmission(args: {
  question: string;
  code: string;
  language: string;
  difficulty: CodingDifficulty;
}): Promise<CodingEvaluation> {
  const systemPrompt = `
You are a principal engineer evaluating a candidate's coding interview solution.
Return strict JSON only with:
{
  "score": 0-10,
  "correctness": "correct"|"partially_correct"|"incorrect",
  "strengths": string[],
  "weaknesses": string[],
  "issues": string[],
  "timeComplexity": string,
  "spaceComplexity": string,
  "summary": string,
  "suggestions": string[]
}
Rules:
- If correctness is not fully correct, highlight the specific logic gaps.
- Include time/space in Big-O notation.
- Keep feedback concise and actionable.
`.trim();

  const userPrompt = JSON.stringify(
    {
      difficulty: args.difficulty,
      question: args.question,
      language: args.language,
      code: args.code,
    },
    null,
    2
  );

  const payload = await responsesClient.openAiClientJsonResponse({
    model: "gpt-5",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    schema: EvaluationSchema,
  });

  return payload as CodingEvaluation;
}
