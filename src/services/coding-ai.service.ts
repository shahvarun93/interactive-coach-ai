import { z } from "zod";
import { responsesClient } from "../infra/openaiClient";
import { CodingEvaluation } from "../interfaces/CodingEvaluation";
import { CodingDifficulty } from "../interfaces/CodingStats";
import { CodingSignature, CodingSignatureParam } from "../interfaces/CodingSignature";

const SignatureSchema = z.object({
  functionName: z.string().min(1),
  params: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1),
      })
    )
    .default([]),
  returnType: z.string().min(1),
});

const QuestionSchema = z.object({
  question: z.string().min(1),
  solution: z.string().min(1),
  signature: SignatureSchema,
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
  if (key === "javascript" || key.startsWith("javascript") || key === "js") return "javascript";
  if (key.includes("typescript") || key === "ts") return "typescript";
  if (key.includes("python")) return "python";
  if (key === "java") return "java";
  if (key.includes("java")) return "java";
  if (key.includes("go")) return "go";
  return "javascript";
}

function sanitizeIdentifier(value: string, fallback: string) {
  const safe = String(value || "").trim();
  if (!safe) return fallback;
  const normalized = safe.replace(/[^a-zA-Z0-9_]/g, "");
  if (!normalized) return fallback;
  if (/^[0-9]/.test(normalized)) return fallback;
  return normalized;
}

function normalizeType(type: string): { base: string; dims: number } {
  let raw = String(type || "").trim().toLowerCase();
  if (!raw) return { base: "any", dims: 0 };
  raw = raw.replace(/\s+/g, "");

  const arrayMatch = raw.match(/^(array|list)<(.+)>$/);
  if (arrayMatch) {
    raw = `${arrayMatch[2]}[]`;
  }
  if (raw.startsWith("listof")) {
    raw = `${raw.replace("listof", "")}[]`;
  }
  if (raw.startsWith("arrayof")) {
    raw = `${raw.replace("arrayof", "")}[]`;
  }

  let dims = 0;
  while (raw.endsWith("[]")) {
    dims += 1;
    raw = raw.slice(0, -2);
  }

  let base = raw;
  if (["int", "integer"].includes(base)) base = "int";
  else if (["long"].includes(base)) base = "long";
  else if (["double", "float", "number", "decimal"].includes(base)) base = "double";
  else if (["string", "str", "text"].includes(base)) base = "string";
  else if (["boolean", "bool"].includes(base)) base = "boolean";
  else if (["char", "character"].includes(base)) base = "char";
  else if (["void", "none", "null"].includes(base)) base = "void";

  return { base, dims };
}

function typeForLanguage(language: string, type: string): string {
  const { base, dims } = normalizeType(type);
  const applyDims = (t: string, dimsCount: number, suffix = "[]") => {
    let out = t;
    for (let i = 0; i < dimsCount; i += 1) out += suffix;
    return out;
  };

  switch (language) {
    case "typescript": {
      const baseType =
        base === "int" || base === "long" || base === "double"
          ? "number"
          : base === "boolean"
            ? "boolean"
            : base === "string" || base === "char"
              ? "string"
              : base === "void"
                ? "void"
                : "any";
      return applyDims(baseType, dims);
    }
    case "python": {
      const baseType =
        base === "int" || base === "long"
          ? "int"
          : base === "double"
            ? "float"
            : base === "boolean"
              ? "bool"
              : base === "string" || base === "char"
                ? "str"
                : base === "void"
                  ? "None"
                  : "Any";
      if (dims === 0) return baseType;
      let out = baseType;
      for (let i = 0; i < dims; i += 1) out = `List[${out}]`;
      return out;
    }
    case "java": {
      const baseType =
        base === "int"
          ? "int"
          : base === "long"
            ? "long"
            : base === "double"
              ? "double"
              : base === "boolean"
                ? "boolean"
                : base === "string"
                  ? "String"
                  : base === "char"
                    ? "char"
                    : base === "void"
                      ? "void"
                      : "Object";
      return applyDims(baseType, dims);
    }
    case "go": {
      const baseType =
        base === "int"
          ? "int"
          : base === "long"
            ? "int64"
            : base === "double"
              ? "float64"
              : base === "boolean"
                ? "bool"
                : base === "string"
                  ? "string"
                  : base === "char"
                    ? "rune"
                    : base === "void"
                      ? ""
                      : "interface{}";
      if (baseType === "") return "";
      let out = baseType;
      for (let i = 0; i < dims; i += 1) out = `[]${out}`;
      return out;
    }
    case "javascript":
    default:
      return "";
  }
}

function defaultReturnFor(language: string, type: string): string {
  const { base, dims } = normalizeType(type);
  if (base === "void") return "";

  const isArray = dims > 0;
  switch (language) {
    case "typescript":
    case "javascript":
      if (isArray) return "return [];";
      if (base === "boolean") return "return false;";
      if (base === "string" || base === "char") return "return \"\";";
      if (base === "int" || base === "long" || base === "double") return "return 0;";
      return "return null;";
    case "python":
      if (isArray) return "return []";
      if (base === "boolean") return "return False";
      if (base === "string" || base === "char") return "return \"\"";
      if (base === "int" || base === "long" || base === "double") return "return 0";
      return "return None";
    case "java":
      if (isArray) return `return new ${typeForLanguage("java", type)}{};`;
      if (base === "boolean") return "return false;";
      if (base === "string" || base === "char") return "return \"\";";
      if (base === "int" || base === "long" || base === "double") return "return 0;";
      return "return null;";
    case "go":
      if (isArray) return "return nil";
      if (base === "boolean") return "return false";
      if (base === "string" || base === "char") return "return \"\"";
      if (base === "int" || base === "long" || base === "double") return "return 0";
      return "return nil";
    default:
      return "";
  }
}

export function boilerplateForSignature(language: string, signature: CodingSignature): string {
  const normalizedLang = normalizeLanguage(language);
  const functionName = sanitizeIdentifier(signature.functionName, "solve");
  const params = signature.params ?? [];
  const returnType = signature.returnType || "void";

  if (normalizedLang === "javascript") {
    const paramList = params.map((p) => sanitizeIdentifier(p.name, "arg")).join(", ");
    const returnLine = defaultReturnFor("javascript", returnType);
    return `function ${functionName}(${paramList}) {\n  // TODO: implement\n${returnLine ? "  " + returnLine + "\n" : ""}}\n\nmodule.exports = ${functionName};`;
  }

  if (normalizedLang === "typescript") {
    const paramList = params
      .map((p, idx) => {
        const name = sanitizeIdentifier(p.name, `arg${idx}`);
        const type = typeForLanguage("typescript", p.type);
        return `${name}: ${type || "any"}`;
      })
      .join(", ");
    const tsReturn = typeForLanguage("typescript", returnType) || "void";
    const returnLine = defaultReturnFor("typescript", returnType);
    return `function ${functionName}(${paramList}): ${tsReturn} {\n  // TODO: implement\n${returnLine ? "  " + returnLine + "\n" : ""}}\n\nexport default ${functionName};`;
  }

  if (normalizedLang === "python") {
    const needsList = params.some((p) => normalizeType(p.type).dims > 0) || normalizeType(returnType).dims > 0;
    const imports = needsList ? "from typing import List\n\n" : "";
    const paramList = params
      .map((p, idx) => {
        const name = sanitizeIdentifier(p.name, `arg${idx}`);
        const type = typeForLanguage("python", p.type);
        return `${name}: ${type || "Any"}`;
      })
      .join(", ");
    const pyReturn = typeForLanguage("python", returnType) || "Any";
    const returnLine = defaultReturnFor("python", returnType);
    return `${imports}def ${functionName}(${paramList}) -> ${pyReturn}:\n    # TODO: implement\n${returnLine ? "    " + returnLine + "\n" : "    pass\n"}`;
  }

  if (normalizedLang === "java") {
    const paramList = params
      .map((p, idx) => {
        const name = sanitizeIdentifier(p.name, `arg${idx}`);
        const type = typeForLanguage("java", p.type) || "Object";
        return `${type} ${name}`;
      })
      .join(", ");
    const javaReturn = typeForLanguage("java", returnType) || "void";
    const returnLine = defaultReturnFor("java", returnType);
    return `public class Solution {\n    public static ${javaReturn} ${functionName}(${paramList}) {\n        // TODO: implement\n${returnLine ? "        " + returnLine + "\n" : ""}    }\n}`;
  }

  if (normalizedLang === "go") {
    const paramList = params
      .map((p, idx) => {
        const name = sanitizeIdentifier(p.name, `arg${idx}`);
        const type = typeForLanguage("go", p.type) || "interface{}";
        return `${name} ${type}`;
      })
      .join(", ");
    const goReturn = typeForLanguage("go", returnType);
    const returnLine = defaultReturnFor("go", returnType);
    const returnClause = goReturn ? ` ${goReturn}` : "";
    return `package main\n\nfunc ${functionName}(${paramList})${returnClause} {\n  // TODO: implement\n${returnLine ? "  " + returnLine + "\n" : ""}}`;
  }

  return `function ${functionName}() {\n  // TODO: implement\n}`;
}

export function boilerplateForLanguage(language: string): string {
  return boilerplateForSignature(language, { functionName: "solve", params: [{ name: "input", type: "string" }], returnType: "string" });
}

function normalizeSignature(signature: CodingSignature): CodingSignature {
  const functionName = sanitizeIdentifier(signature.functionName, "solve");
  const params = (signature.params ?? []).map((p: CodingSignatureParam, idx: number) => ({
    name: sanitizeIdentifier(p.name, `arg${idx}`),
    type: String(p.type || "any"),
  }));
  const returnType = String(signature.returnType || "void");
  return { functionName, params, returnType };
}

function parseParams(paramText: string): CodingSignatureParam[] {
  if (!paramText) return [];
  return paramText
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, idx) => {
      const [namePart, typePart] = chunk.split(":").map((v) => v.trim());
      if (typePart) {
        return {
          name: sanitizeIdentifier(namePart || `arg${idx}`, `arg${idx}`),
          type: typePart,
        };
      }
      const pieces = chunk.split(/\s+/).filter(Boolean);
      if (pieces.length >= 2) {
        const name = sanitizeIdentifier(pieces[pieces.length - 1], `arg${idx}`);
        const type = pieces.slice(0, -1).join(" ");
        return { name, type };
      }
      return { name: sanitizeIdentifier(namePart || `arg${idx}`, `arg${idx}`), type: "any" };
    });
}

export function extractSignatureFromSolution(language: string, solution: string): CodingSignature | null {
  const normalized = normalizeLanguage(language);
  const text = solution || "";
  let match: RegExpMatchArray | null = null;

  if (normalized === "javascript" || normalized === "typescript") {
    match = text.match(/function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*(?::\s*([^{\s]+))?/);
    if (!match) {
      match = text.match(/const\s+([A-Za-z0-9_]+)\s*=\s*\(([^)]*)\)\s*=>\s*(?::\s*([^{\s]+))?/);
    }
    if (!match) return null;
    const [, fn, params, ret] = match;
    return normalizeSignature({
      functionName: fn,
      params: parseParams(params),
      returnType: ret || "any",
    });
  }

  if (normalized === "python") {
    match = text.match(/def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*(?:->\s*([^\s:]+))?\s*:/);
    if (!match) return null;
    const [, fn, params, ret] = match;
    return normalizeSignature({
      functionName: fn,
      params: parseParams(params),
      returnType: ret || "Any",
    });
  }

  if (normalized === "java") {
    match = text.match(/static\s+([A-Za-z0-9_<>\[\]]+)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
    if (!match) return null;
    const [, ret, fn, params] = match;
    return normalizeSignature({
      functionName: fn,
      params: parseParams(params),
      returnType: ret,
    });
  }

  if (normalized === "go") {
    match = text.match(/func\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^{\s]+)?\s*\{/);
    if (!match) return null;
    const [, fn, params, ret] = match;
    return normalizeSignature({
      functionName: fn,
      params: parseParams(params),
      returnType: ret || "any",
    });
  }

  return null;
}

export async function generateCodingQuestion(args: {
  topic: string;
  difficulty: CodingDifficulty;
  language: string;
}): Promise<{ question: string; boilerplate: string; solution: string; signature: CodingSignature }> {
  const normalizedLang = normalizeLanguage(args.language);
  const systemPrompt = `
You are a senior software engineer generating coding interview questions.
- Keep it realistic for FAANG-style interviews.
- Match the requested difficulty, topic, and language.
- Provide a correct reference solution in the same language.
- Return a function/class signature with parameter and return types.
- Do NOT include a main function or input/output scaffolding.
- Do NOT include markdown or code fences.
Return JSON:
{
  "question": "...",
  "solution": "...",
  "signature": {
    "functionName": "...",
    "params": [{"name": "...", "type": "int[]"}],
    "returnType": "int"
  }
}
`.trim();

  const userPrompt = `Generate a ${args.difficulty} coding interview question about ${args.topic} in ${normalizedLang}.
Return a LeetCode-style function/class signature that matches the problem.
Use only these canonical types (lowercase): int, long, double, boolean, string, char, void, int[], long[], double[], boolean[], string[], int[][], string[][].
Include all required inputs as separate parameters (do NOT encode multiple inputs into a single string).
Provide a correct reference solution (full implementation) that matches the signature.
Do not include main() or I/O handling in the solution.`;

  const payload = await responsesClient.openAiClientJsonResponse({
    model: "gpt-5",
    temperature: 0.8,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    schema: QuestionSchema,
  });

  const parsedSignature = extractSignatureFromSolution(normalizedLang, payload.solution);
  const signature = normalizeSignature(parsedSignature ?? payload.signature);
  const boilerplate = boilerplateForSignature(normalizedLang, signature);

  return {
    question: payload.question.trim(),
    boilerplate,
    solution: payload.solution.trim(),
    signature,
  };
}

export async function evaluateCodingSubmission(args: {
  question: string;
  code: string;
  language: string;
  difficulty: CodingDifficulty;
  expectedSignature?: CodingSignature | null;
  userSignature?: CodingSignature | null;
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
- If the user's function signature (name/params/return type) does not match the expected signature,
  note it under "issues" and reduce the score appropriately.
`.trim();

  const userPrompt = JSON.stringify(
    {
      difficulty: args.difficulty,
      question: args.question,
      language: args.language,
      expectedSignature: args.expectedSignature ?? null,
      userSignature: args.userSignature ?? null,
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
