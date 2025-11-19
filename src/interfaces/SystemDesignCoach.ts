export interface SystemDesignCoachFeedback {
  summary: string;
  whatYouDidWell: string[];
  whatToImproveNextTime: string[];
  nextPracticeSuggestion?: {
    suggestedTopic: string;
    suggestedDifficulty: 'easy' | 'medium' | 'hard';
    reason: string;
  };
}

export interface SystemDesignCoachResponse {
  sessionId: string;
  topic: string;
  difficulty: string;
  score: number;
  coachFeedback: SystemDesignCoachFeedback;
}