// src/services/resume.service.ts
import * as usersDao from "../dao/users.dao";
import * as resumeAiService from "./resume-ai.service";
import {
  AnalyzeResumeResult,
  AnalyzeResumeTextInput,
} from "../interfaces/ResumeAnalysis";
import { TailorResumeFromTextInput } from "../interfaces/ResumeService";
import pdfParseModule from "pdf-parse";
import mammoth from "mammoth";

/**
 * High-level orchestration for analyzing a resume from raw text.
 * - Optionally ties it to a user by email
 * - Delegates to resume-ai.service for the LLM call
 * - Later this is where we can persist analysis to Postgres, add auditing, etc.
 */

const MAX_BYTES = 2 * 1024 * 1024;

export async function analyzeResumeFromText(
  input: AnalyzeResumeTextInput
): Promise<AnalyzeResumeResult> {
  const email = (input.email ?? "").trim() || null;

  let userId: string | null = null;
  if (email) {
    const user = await usersDao.findUserByEmail(email);
    if (user) {
      userId = user.id;
    }
    // Note: we *don’t* blow up if user doesn’t exist – it can be a “guest” analysis.
  }

  const analysis = await resumeAiService.analyzeResumeText(input.text, {
    targetRole: input.targetRole,
    targetCompany: input.targetCompany,
    mode: input.mode
  });

  // TODO: (optional) persist to DB, e.g. resume_analyses table

  return {
    email,
    userId,
    analysis,
  };
}

export async function tailorResumeFromText(input: TailorResumeFromTextInput) {
  return resumeAiService.tailorResumeToJobDescription(input);
}

export async function extractResumeTextFromFile(
  file: Express.Multer.File
): Promise<{ text: string }> {
  if (file.size > MAX_BYTES) {
    return {
      text: "File is too large. Please upload a resume under 2 MB or paste the text manually.",
    };
  }

  const mime = (file.mimetype || "").toLowerCase();
  const originalName = (file.originalname || "").toLowerCase();

  // 1) Plain text / JSON files
  if (
    mime === "text/plain" ||
    mime === "application/json" ||
    originalName.endsWith(".txt") ||
    originalName.endsWith(".json")
  ) {
    return { text: file.buffer.toString("utf8") };
  }

  // 2) PDF files
  if (mime === "application/pdf" || originalName.endsWith(".pdf")) {
    try {
      const parsed = await new pdfParseModule.PDFParse(file.buffer);
      const parsedText = await parsed.getText();
      const text = (parsedText.text || "").trim();
      if (text.length > 0) {
        return { text };
      }
    } catch (err) {
      console.error("Failed to extract text from PDF:", err);
    }
  }

  // 3) DOCX files
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    originalName.endsWith(".docx")
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const text = (result.value || "").trim();
      if (text.length > 0) {
        return { text };
      }
    } catch (err) {
      console.error("Failed to extract text from DOCX:", err);
    }
  }

  // 4) Fallback for unsupported types or failed parsing
  const fallback = `Could not automatically parse this file type (${
    mime || "unknown"
  }). Please copy-paste the text from your resume.`;
  return { text: fallback };
}
