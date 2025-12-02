import { UserSystemDesignStats } from "./UserSDStats";
import { SystemDesignCoachFeedback } from "./SystemDesignCoach";
import { SystemDesignSession } from "../interfaces/SystemDesignSession";
import { TopicMistakePatterns } from "../interfaces/TopicMistakes";
import { SDResource } from "../interfaces/SDResource";
import { SystemDesignCoachResponse } from "../interfaces/SystemDesignCoach";

export type SDGraphState = {
  email: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  sessionId?: string;
  question?: string;
  answer?: string;
  score?: number;
  coachFeedback?: SystemDesignCoachFeedback;
  stats?: UserSystemDesignStats;
  done?: boolean;
};

export interface SDCoachGraphState {
  email: string;
  userId?: string;
  sessionId: string;

  session?: SystemDesignSession;
  stats?: UserSystemDesignStats;
  topicMistakePatterns?: TopicMistakePatterns;
  ragResources?: SDResource[];

  coachResponse?: SystemDesignCoachResponse;
  error?: string;
}
