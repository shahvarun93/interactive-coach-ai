// src/services/resume-ai.service.ts
import { z } from "zod";
import * as openAiClient from "../infra/openaiClient";
import { ResumeAnalysis } from "../interfaces/ResumeAnalysis";
import { AnalyzeMode, AnalyzeResumeOptions } from "../interfaces/ResumeAI";
import { TailorResumeFromTextInput } from "../interfaces/ResumeService";

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
  opts?: AnalyzeResumeOptions
): Promise<ResumeAnalysis> {
  const { targetRole, targetCompany, mode } = opts ?? {};
  const analysisMode: AnalyzeMode =
    mode === "postTailor" ? "postTailor" : "firstPass";

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
  
  IMPORTANT NORMALIZATION:
  - If you do not know a value, use null for strings and [] for arrays.
  - Do NOT put free-floating bullet sentences directly under "parsed".
    All bullet-level rewrites go under "improvedSampleBullets" or "suggestions".
  - Do NOT include any keys at the top level other than:
    "parsed", "issues", "sectionIssues", "suggestions", "improvedSampleBullets".
  - Do NOT include commentary outside the JSON object.
  
  CALIBRATION / SECOND-PASS BEHAVIOR:

  - The user message will include an "Analysis mode" line: either "Analysis mode: firstPass" or "Analysis mode: postTailor".
  - If the mode is "firstPass":
    - Behave as a normal, thorough reviewer.
    - Point out all material issues that would improve the resume for the target role.
    - You can still leave arrays empty if the resume is already very strong, but you do not need to be minimal.

  - If the mode is "postTailor":
    - Assume this resume was ALREADY rewritten by a resume assistant for the target role and company.
    - Your job is a light, post-tailor sanity check, not a full critique.
    - You MUST keep feedback minimal and only flag truly critical issues, such as:
      - obvious missing contact information that would block a real application,
      - glaring contradictions or red flags,
      - complete mismatch with the stated target role.
    - In typical strong post-tailor cases, you should set:
      - "issues": [] (empty array)
      - "sectionIssues": {} (empty object)
      - "suggestions": [] (empty array)
      - "improvedSampleBullets": [] (empty array)
    - Only add 1–3 high-level suggestions if they clearly improve chances in a screen for the target role.
    - Do NOT invent nitpicky issues just to fill these arrays. Focus ONLY on changes that would materially
      improve chances in a screen for the target role.
  `;

  const userContent =
    `Analysis mode: ${analysisMode}\n\n` +
    `Here is the raw resume text:\n\n${rawText}\n\n` +
    `Target role: ${
      targetRole ??
      "Senior/Staff Software Engineer in a role that includes a system design interview (backend, full-stack, infra, SRE, or AI-focused)"
    }\n` +
    `Target company: ${targetCompany ?? "a high-bar product/tech company"}\n\n` +
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

const ParsedExperienceItemSchema = z.object({
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  dateRange: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  bullets: z.array(z.string()).nullable().optional(),
});

const TailoredResumeSchema = z.object({
  rewrittenSummary: z.string().optional(),
  rewrittenSkills: ParsedSkillsSchema.optional(),

  // v1: don't validate this strictly – we don't use it in the UI yet
  rewrittenExperience: z.unknown().optional(),

  // model may return a single string or an array of strings
  notesForUser: z.union([z.array(z.string()), z.string()]).optional(),

  fullResumeText: z.string().optional(),
});

export type TailoredResumeResult = z.infer<typeof TailoredResumeSchema>;

export async function tailorResumeToJobDescription(
  args: TailorResumeFromTextInput
): Promise<TailoredResumeResult> {
  const { text, jobDescription, targetRole, targetCompany } = args;

  const systemPrompt = `
  You are an expert resume writer and hiring manager who specializes in:
  - ATS-compliant resumes
  - Senior backend and system design roles (FAANG and non-FAANG)
  
  You will receive:
  1) The candidate's CURRENT resume as raw text.
  2) The TARGET job description.
  3) Optional target role / target company.
  
  Your job:
  - Rewrite the resume to better match the job description and senior backend / system design expectations.
  - Keep everything ATS-friendly: no tables, no fancy characters, no markdown.
  - Keep it honest: do NOT invent experience or projects. Only rephrase, reorganize, and refocus what is already there.
  - Strongly emphasize:
    - measurable impact
    - system design / architecture / scalability
    - backend / distributed systems
    - relevant cloud and tooling for large-scale systems.
  
  IMPORTANT:
  - Output MUST be valid JSON matching the provided schema.
  - "fullResumeText" must be a single plain-text resume ready to paste into a doc.
  - Do NOT wrap the JSON in markdown fences.
  `.trim();

  const userContent = `
  CURRENT RESUME (RAW TEXT)
  -------------------------
  ${text}
  
  TARGET JOB DESCRIPTION
  ----------------------
  ${jobDescription}
  
  TARGET ROLE (optional): ${targetRole || "N/A"}
  TARGET COMPANY (optional): ${targetCompany || "N/A"}
  
  TASK:
  1) Rewrite the entire resume in a stronger, senior-friendly style aligned with the JD.
  2) Ensure it stays truthful to the candidate's experience.
  3) Return:
     - "fullResumeText": the complete revised resume, ATS-safe.
     - "rewrittenSummary": improved summary only.
     - "rewrittenSkills": cleaned and categorized skills (if possible).
     - "rewrittenExperience": improved bullets per role (if you can structure them).
     - "notesForUser": brief notes explaining the main changes.
  `.trim();

  const result =
    await openAiClient.responsesClient.openAiClientJsonResponse<TailoredResumeResult>(
      {
        schema: TailoredResumeSchema,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        model: "gpt-4.1-mini",
        temperature: 0.4,
      }
    );

  return result;
}
