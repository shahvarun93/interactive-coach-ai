// src/services/systemDesignService.ts
import { SystemDesignSession } from '../interfaces/SystemDesignSession';
import { generateSystemDesignQuestion } from './system-design-ai.service';
import * as systemDesignDao from '../dao/system-design.dao';
import { evaluateSystemDesignAnswer } from './system-design-eval.service.';
import { SubmitAnswerResult } from '../interfaces/SubmitAnswerResult';
import { OverallLevel, TopicStats, UserStats } from '../interfaces/UserStats';

export async function submitSystemDesignAnswer(
  sessionId: string,
  answer: string
): Promise<SubmitAnswerResult> {
  const session = await systemDesignDao.getSessionById(sessionId);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  const evaluation = await evaluateSystemDesignAnswer(session.prompt, answer);

  // We’ll store strengths/weaknesses as JSON string in TEXT columns
  const systemDesignSession = await systemDesignDao.updateSystemDesignSessions(answer, evaluation.score, JSON.stringify(evaluation.strengths), JSON.stringify(evaluation.weaknesses), sessionId);

  return {
    session: systemDesignSession as SystemDesignSession,
    evaluation,
  };
}

export async function createSystemDesignSession(
  userId: string,
  prompt: string,
  topic: string | null
): Promise<SystemDesignSession> {
  const createSystemDesignSession = await systemDesignDao.createSystemDesignSession(userId, prompt, topic);

  return createSystemDesignSession;
}

export async function listSessionsForUser(
  userId: string
): Promise<SystemDesignSession[]> {
  const allUserSessions = await systemDesignDao.listSessionsForUser(userId);
  return allUserSessions;
}

export async function createAISystemDesignSessionForUser(
  userId: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  topic: string | null
): Promise<{ session: SystemDesignSession; question: string }> {
  const { question } = await generateSystemDesignQuestion(difficulty, topic);

  const session = await createSystemDesignSession(userId, question, topic);

  return { session, question };
}

// src/services/system-design.service.ts
export async function getSessionById(
  id: string
): Promise<SystemDesignSession | null> {
  return await systemDesignDao.getSessionById(id);
}

// •	For each user, we compute:
// 1.	Overall SD average score
// From all their answered sessions across all topics
// → overallAvg
// 2.	Per-topic average scores
// For each topic (caching, queues, etc.), we compute that topic’s:
// •	topicAverageScore = average of scores for that topic for that user
// •	Then we say:

// If topicAverageScore < overallAvg → that topic goes into weakTopics.
export async function getUserStats(userId: string): Promise<UserStats | null> {
  const row = await systemDesignDao.findUserStatsRow(userId);
  if (!row) return null;

  const overallAvg =
    row.average_score !== null ? Number(row.average_score) : null;

  let overallLevel: OverallLevel | null = null;
  if (overallAvg !== null) {
    if (overallAvg < 5) overallLevel = 'needs_improvement';
    else if (overallAvg < 7) overallLevel = 'intermediate';
    else overallLevel = 'strong';
  }

  const topicRows = await systemDesignDao.findUserTopicStatsRows(userId);

  const topics: TopicStats[] = topicRows
    .filter((r) => r.topic !== null)
    .map((r) => {
      const avg =
        r.average_score !== null ? Number(r.average_score) : null;
      const base = overallAvg;

      let label: 'weak' | 'neutral' | 'strong' = 'neutral';

      if (base !== null && avg !== null) {
        if (avg <= base - 1) label = 'weak';
        else if (avg >= base + 1) label = 'strong';
      }

      return {
        topic: r.topic as string,
        sessions: Number(r.total_sessions) || 0,
        averageScore: avg,
        label,
      };
    });

  const weakTopics = topics
    .filter((t) => t.label === 'weak')
    .map((t) => t.topic);

  const strongTopics = topics
    .filter((t) => t.label === 'strong')
    .map((t) => t.topic);

  return {
    userId: row.user_id,
    totalSessions: Number(row.total_sessions) || 0,
    answeredSessions: Number(row.answered_sessions) || 0,
    averageScore: overallAvg,
    lastSessionAt: row.last_session_at,
    overallLevel,
    topics,
    weakTopics,
    strongTopics,
  };
}
