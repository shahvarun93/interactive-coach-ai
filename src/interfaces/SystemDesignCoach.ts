export interface SystemDesignCoachFeedback {
  summary: string;
  whatYouDidWell: string[];
  whatToImproveNextTime: string[];
  nextPracticeSuggestion?: {
    suggestedTopic: string;
    suggestedDifficulty: 'easy' | 'medium' | 'hard';
    reason: string;
  };
  recommendedResources?: Array<{
    id: string;
    title: string;
    url: string | null;
  }>;
}

export interface SystemDesignCoachResponse {
  sessionId: string;
  topic: string;
  difficulty: string;
  score: number;
  coachFeedback: SystemDesignCoachFeedback;
  resources: {
    id: string;
    title: string;
    url: string | null;
    topic: string;
    contentSnippet: string
  }[];
}