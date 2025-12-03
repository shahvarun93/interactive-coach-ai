// src/services/resume.service.ts
import * as usersDao from "../dao/users.dao";
import * as resumeAiService from "./resume-ai.service";
import { AnalyzeResumeResult, AnalyzeResumeTextInput} from "../interfaces/ResumeAnalysis";

/**
 * High-level orchestration for analyzing a resume from raw text.
 * - Optionally ties it to a user by email
 * - Delegates to resume-ai.service for the LLM call
 * - Later this is where we can persist analysis to Postgres, add auditing, etc.
 */
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
  });

  // TODO: (optional) persist to DB, e.g. resume_analyses table

  return {
    email,
    userId,
    analysis,
  };
}