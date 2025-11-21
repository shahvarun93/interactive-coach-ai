type TopicMistake = {
  mistake: string;
  count: number;
};

export type TopicMistakePatterns = {
  sessionsConsidered: number;
  recurringMistakes: TopicMistake[];
};
