// src/interfaces/ResumeAI.ts

export type AnalyzeMode = "firstPass" | "postTailor";

export interface AnalyzeResumeOptions {
  targetRole?: string;
  targetCompany?: string;
  mode?: AnalyzeMode;
}

