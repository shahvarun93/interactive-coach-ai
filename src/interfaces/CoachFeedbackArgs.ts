import { SDResource } from './SDResource';

export interface CoachFeedbackArgs {
    topic: string;
    difficulty: string;
    question: string;
    answer: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    resources?: SDResource[];
  }