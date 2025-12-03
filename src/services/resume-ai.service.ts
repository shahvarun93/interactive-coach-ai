// src/services/resume-ai.service.ts
import { z } from "zod";
import * as openAiClient from "../infra/openaiClient";
import { ResumeAnalysis } from "../interfaces/ResumeAnalysis";

// ----- Zod schemas for resume analysis -----

const ParsedExperienceSchema = z.object({
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  dateRange: z.string().nullable().optional(),
  bullets: z.array(z.string()).nullable().optional(),
});

const ParsedEducationSchema = z.object({
  degree: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  dateRange: z.string().nullable().optional(),
  gpa: z.union([z.string(), z.number()]).nullable().optional(),
});

const ParsedProjectSchema = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  techStack: z.array(z.string()).nullable().optional(),
  link: z.string().nullable().optional(),
});

// --- Skills schema aligned with ResumeSkills ---
const ParsedSkillsSchema = z.object({
  languages: z.array(z.string()).nullable().optional(),
  frameworks: z.array(z.string()).nullable().optional(),
  databases: z.array(z.string()).nullable().optional(),
  cloud: z.array(z.string()).nullable().optional(),
  tools: z.array(z.string()).nullable().optional(),
  other: z.array(z.string()).nullable().optional(),
});

const ParsedResumeSchema = z.object({
  name: z.string().min(1),

  // Accept string | null | undefined, but output string | undefined
  headline: z
    .string()
    .nullish()
    .transform((v) => (v == null ? undefined : v)),

  location: z
    .string()
    .nullish()
    .transform((v) => (v == null ? undefined : v)),

  contact: z
    .object({
      email: z
        .string()
        .nullish()
        .transform((v) => (v == null ? undefined : v)),
      phone: z
        .string()
        .nullish()
        .transform((v) => (v == null ? undefined : v)),
      linkedin: z
        .string()
        .nullish()
        .transform((v) => (v == null ? undefined : v)),
      github: z
        .string()
        .nullish()
        .transform((v) => (v == null ? undefined : v)),
      other: z
        .string()
        .nullish()
        .transform((v) => (v == null ? undefined : v)),
    })
    .nullish()
    .transform((v) => (v == null ? undefined : v)),

  summary: z
    .string()
    .nullish()
    .transform((v) => (v == null ? undefined : v)),

  // Skills: match ResumeSkills shape and normalize null → []
  skills: ParsedSkillsSchema.nullish().transform((v) => {
    if (!v) return undefined;
    return {
      languages: v.languages ?? [],
      frameworks: v.frameworks ?? [],
      databases: v.databases ?? [],
      cloud: v.cloud ?? [],
      tools: v.tools ?? [],
      other: v.other ?? [],
    };
  }),

  // Normalize null/undefined → []
  experience: z
    .array(ParsedExperienceSchema)
    .nullish()
    .transform((v) => v ?? []),

  education: z
    .array(ParsedEducationSchema)
    .nullish()
    .transform((v) => v ?? []),

  projects: z
    .array(ParsedProjectSchema)
    .nullish()
    .transform((v) => v ?? []),
});

const ImprovedSampleBulletSchema = z.object({
  section: z.string(),
  original: z.string().nullable().optional(),
  improved: z.string(),
});

export const ResumeAnalysisSchema = z.object({
  parsed: ParsedResumeSchema,
  issues: z.array(z.string()).optional().default([]),
  sectionIssues: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .default({}),
  suggestions: z.array(z.string()).optional().default([]),
  improvedSampleBullets: z
    .array(ImprovedSampleBulletSchema)
    .optional()
    .default([]),
});

// ----- Main function -----

export async function analyzeResumeText(
  rawText: string,
  opts?: { targetRole?: string; targetCompany?: string }
): Promise<ResumeAnalysis> {
  const { targetRole, targetCompany } = opts ?? {};

  const systemPrompt = `
You are an expert FAANG-level resume analyst and career coach.

Your job:
1. Parse the user's resume text into a normalized JSON structure.
2. Identify issues and weaknesses relevant to senior / FAANG interviews.
3. Suggest concrete improvements and sample improved bullets.

CRITICAL OUTPUT RULES:
- You MUST return ONLY a single JSON object.
- Do NOT wrap it in backticks, markdown, or a code fence.
- Do NOT return a JSON string; return a raw JSON object.
- The top-level shape MUST be exactly:

{
  "parsed": {
    "name": string,
    "headline": string or null,
    "location": string or null,
    "contact": {
      "email": string or null,
      "phone": string or null,
      "linkedin": string or null,
      "github": string or null,
      "other": string or null
    } or null,
    "summary": string or null,

    "skills": {
      "languages": string[] or null,
      "frameworks": string[] or null,
      "databases": string[] or null,
      "cloud": string[] or null,
      "tools": string[] or null,
      "other": string[] or null
    } or null,

    "experience": [
      {
        "title": string or null,
        "company": string or null,
        "location": string or null,
        "dateRange": string or null,
        "bullets": string[] or null
      }
    ],
    "education": [
      {
        "degree": string or null,
        "field": string or null,
        "institution": string or null,
        "location": string or null,
        "dateRange": string or null,
        "gpa": string or number or null
      }
    ],
    "projects": [
      {
        "name": string or null,
        "description": string or null,
        "techStack": string[] or null,
        "link": string or null
      }
    ]
  },
  "issues": string[],
  "sectionIssues": {
    "<sectionName>": string[]
  },
  "suggestions": string[],
  "improvedSampleBullets": [
    {
      "section": string,
      "original": string or null,
      "improved": string
    }
  ]
}

IMPORTANT:
- If you do not know a value, use null for strings and [] for arrays.
- Do NOT put free-floating bullet sentences directly under "parsed".
  All bullet-level rewrites go under "improvedSampleBullets" or "suggestions".
- Do NOT include any keys at the top level other than:
  "parsed", "issues", "sectionIssues", "suggestions", "improvedSampleBullets".
- Do NOT include commentary outside the JSON object.
`;

  const userContent =
    `Here is the raw resume text:\n\n${rawText}\n\n` +
    `Target role: ${
      targetRole ?? "Senior Backend / System Design Engineer"
    }\n` +
    `Target company: ${targetCompany ?? "a FAANG-style company"}\n\n` +
    `Return ONLY the JSON object as specified in the instructions.`;

  // Use `any` at the call site to avoid fighting Zod's internal output typing,
  // then cast to ResumeAnalysis. Runtime safety still comes from the schema.
  const parsed =
    await openAiClient.responsesClient.openAiClientJsonResponse<any>({
      schema: ResumeAnalysisSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      model: "gpt-4.1-mini",
    });

  return parsed as ResumeAnalysis;
}