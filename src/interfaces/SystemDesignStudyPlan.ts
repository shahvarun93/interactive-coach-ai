export interface StudyPlanStep {
  step: number;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  goals: string[];
}

export interface SystemDesignStudyPlan {
  profileSummary: string;
  focusTopics: string[];
  recommendedSequence: StudyPlanStep[];
  practiceSuggestions: string[];
}
