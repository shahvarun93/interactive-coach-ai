// src/interfaces/SystemDesignService.ts
import { SystemDesignSession } from "./SystemDesignSession";
import { Difficulty } from "./UserSDStats";

export interface CreateAISystemDesignSessionResult {
  session: SystemDesignSession;
  question: string;
}

export interface ChooseNextTopicAndDifficultyResult {
  topic: string;
  difficulty: Difficulty;
  reason: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  url: string | null;
}

export type ResourcesByTopic = Record<string, ResourceItem[]>;

