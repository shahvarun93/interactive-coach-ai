import { ParsedResume } from "./Resume";

export interface AnalyzeResumeTextInput {
  email?: string;
  text: string;
  targetRole?: string;
  targetCompany?: string;
  mode?: "firstPass" | "postTailor";
}

export interface AnalyzeResumeResult {
  email: string | null;
  userId: string | null;
  analysis: ResumeAnalysis;
}

export interface ResumeAnalysis {
  parsed: ParsedResume;
  issues: string[]; // global issues
  sectionIssues?: {
    summary?: string[];
    skills?: string[];
    experience?: string[];
    projects?: string[];
  };
  suggestions: string[]; // prioritized high-level suggestions
  improvedSampleBullets?: string[]; // example rewrites user can copy
}
