import { z } from "zod";
import { responsesClient } from "../infra/openaiClient";
import { CodingEvaluation } from "../interfaces/CodingEvaluation";
import { CodingDifficulty } from "../interfaces/CodingStats";

const QuestionSchema = z.object({
  question: z.string().min(1),
  boilerplate: z.string().min(1),
  solution: z.string().min(1),
});

const EvaluationSchema = z.object({
  score: z.coerce.number().min(0).max(10),
  correctness: z.enum(["correct", "partially_correct", "incorrect"]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  timeComplexity: z.string().min(1),
  spaceComplexity: z.string().min(1),
  summary: z.string().min(1),
  suggestions: z.array(z.string()).default([]),
});

export function normalizeLanguage(input: string): string {
  const key = String(input || "").trim().toLowerCase();
  if (key.startsWith("js")) return "javascript";
  if (key.includes("typescript") || key === "ts") return "typescript";
  if (key.includes("python")) return "python";
  if (key.includes("java")) return "java";
  if (key.includes("go")) return "go";
  return "javascript";
}

export function boilerplateForLanguage(language: string): string {
  switch (language) {
    case "typescript":
      return `function solve(input: string): string {\n  // TODO: implement\n  return \"\";\n}\n\nexport default solve;`;
    case "python":
      return `def solve(input: str) -> str:\n    # TODO: implement\n    return \"\"\n\nif __name__ == \"__main__\":\n    import sys\n    data = sys.stdin.read()\n    print(solve(data))`;
    case "java":
      return `import java.io.*;\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        StringBuilder sb = new StringBuilder();\n        String line;\n        while ((line = br.readLine()) != null) {\n            sb.append(line).append(\"\\n\");\n        }\n        System.out.print(solve(sb.toString()));\n    }\n\n    static String solve(String input) {\n        // TODO: implement\n        return \"\";\n    }\n}`;
    case "go":
      return `package main\n\nimport (\n  \"bufio\"\n  \"fmt\"\n  \"os\"\n  \"strings\"\n)\n\nfunc solve(input string) string {\n  // TODO: implement\n  return \"\"\n}\n\nfunc main() {\n  reader := bufio.NewReader(os.Stdin)\n  data, _ := reader.ReadString(0)\n  if len(data) == 0 {\n    b, _ := os.ReadFile(\"/dev/stdin\")\n    data = string(b)\n  }\n  fmt.Print(solve(strings.TrimRight(data, \"\\n\")))\n}`;
    case "javascript":
    default:
      return `function solve(input) {\n  // TODO: implement\n  return \"\";\n}\n\nmodule.exports = solve;`;
  }
}

export async function generateCodingQuestion(args: {
  topic: string;
  difficulty: CodingDifficulty;
  language: string;
}): Promise<{ question: string; boilerplate: string; solution: string }> {
  const normalizedLang = normalizeLanguage(args.language);
  const systemPrompt = `
You are a senior software engineer generating coding interview questions.
- Keep it realistic for FAANG-style interviews.
- Match the requested difficulty, topic, and language.
- Provide a LeetCode-style function/class skeleton as boilerplate.
- Provide a correct reference solution in the same language.
- Do NOT include markdown or code fences.
Return JSON:
{
  "question": "...",
  "boilerplate": "...",
  "solution": "..."
}
`.trim();

  const userPrompt = `Generate a ${args.difficulty} coding interview question about ${args.topic} in ${normalizedLang}.
Include only a function/class skeleton in boilerplate (no logic).
Provide a correct reference solution (full implementation).`;

  const payload = await responsesClient.openAiClientJsonResponse({
    model: "gpt-5",
    temperature: 0.8,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    schema: QuestionSchema,
  });

  return {
    question: payload.question.trim(),
    boilerplate: boilerplateForLanguage(normalizedLang),
    solution: payload.solution.trim(),
  };
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
