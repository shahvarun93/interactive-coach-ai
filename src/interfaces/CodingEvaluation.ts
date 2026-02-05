export interface CodingEvaluation {
  score: number;
  correctness: "correct" | "partially_correct" | "incorrect";
  strengths: string[];
  weaknesses: string[];
  issues: string[];
  timeComplexity: string;
  spaceComplexity: string;
  summary: string;
  suggestions: string[];
}
