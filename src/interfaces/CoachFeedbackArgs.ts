import { SDResource } from './SDResource';
import { TopicMistakePatterns } from './TopicMistakes';

export interface CoachFeedbackArgs {
    topic: string;
    difficulty: string;
    question: string;
    answer: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    resources?: SDResource[];
    topicMistakePatterns: TopicMistakePatterns;
  }