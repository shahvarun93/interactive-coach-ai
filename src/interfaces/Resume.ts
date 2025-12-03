// src/interfaces/Resume.ts
export interface ResumeExperienceItem {
  company: string;
  title: string;
  location?: string;
  startDate?: string; // keep as string for now (e.g. "Jan 2022")
  endDate?: string; // or "Present"
  bullets: string[];
}

export interface ResumeEducationItem {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  details?: string[];
}

export interface ResumeSkills {
  languages?: string[];
  frameworks?: string[];
  databases?: string[];
  cloud?: string[];
  tools?: string[];
  other?: string[];
}

export interface ParsedResume {
  name?: string;
  headline?: string;
  location?: string;
  contact?: {
    email?: string;
    phone?: string;
    linkedin?: string;
    github?: string;
    other?: string;
  };
  summary?: string;
  skills?: ResumeSkills;
  experience: ResumeExperienceItem[];
  education: ResumeEducationItem[];
  projects?: {
    name: string;
    description: string;
    bullets?: string[];
    tech?: string[];
  }[];
}
