// src/interfaces/SystemDesignAI.ts
import { UserSystemDesignStats } from "./UserSDStats";
import { ResourceItem, ResourcesByTopic } from "./SystemDesignService";

export interface GetRagResourcesForSessionParams {
  topic: string;
  question: string;
  weaknesses: string[];
}

export interface GenerateSystemDesignStudyPlanParams {
  stats: UserSystemDesignStats;
  resourcesByTopic: ResourcesByTopic;
}

