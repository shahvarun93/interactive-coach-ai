// src/services/systemDesignService.ts
import { SystemDesignSession } from '../interfaces/SystemDesignSession';
import { generateSystemDesignQuestion } from './system-design-ai.service';
import * as systemDesignDao from '../dao/system-design.dao';
import { evaluateSystemDesignAnswer } from './system-design-eval.service.';
import { SubmitAnswerResult } from '../interfaces/SubmitAnswerResult';
import { UserStats } from '../interfaces/UserStats';

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
  const { question } = await generateSystemDesignQuestion(difficulty);

  const session = await createSystemDesignSession(userId, question, topic);

  return { session, question };
}

// src/services/system-design.service.ts
export async function getSessionById(
  id: string
): Promise<SystemDesignSession | null> {
  return await systemDesignDao.getSessionById(id);
}


export async function getUserStats(userId: string): Promise<UserStats | null> {
  const row = await systemDesignDao.findUserStatsRow(userId);
  if (!row) return null;

  return {
    userId: row.user_id,
    totalSessions: Number(row.total_sessions) || 0,
    answeredSessions: Number(row.answered_sessions) || 0,
    averageScore:
      row.average_score !== null ? Number(row.average_score) : null,
    lastSessionAt: row.last_session_at,
  };
}

