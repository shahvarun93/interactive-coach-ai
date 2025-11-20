// src/services/systemDesignService.ts
import { SystemDesignSession } from "../interfaces/SystemDesignSession";
import * as systemDesignDao from "../dao/system-design.dao";
import * as systemDesignAiService from "./system-design-ai.service";
import * as usersDao from "../dao/users.dao";
import { evaluateSystemDesignAnswer } from "./system-design-eval.service";
import { SubmitAnswerResult } from "../interfaces/SubmitAnswerResult";
import {
  OverallLevel,
  TopicLabel,
  TopicStats,
  UserSystemDesignStats,
  Difficulty,
} from "../interfaces/UserSDStats";
import { SystemDesignCoachResponse } from "../interfaces/SystemDesignCoach";
import * as sdResourcesService from "./sd-resources.service";

export async function submitSystemDesignAnswer(
  sessionId: string,
  answer: string
): Promise<SubmitAnswerResult> {
  const session = await systemDesignDao.getSessionById(sessionId);
  if (!session) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const evaluation = await evaluateSystemDesignAnswer(session.prompt, answer);

  // We’ll store strengths/weaknesses as JSON string in TEXT columns
  const systemDesignSession = await systemDesignDao.updateSystemDesignSessions(
    answer,
    evaluation.score,
    JSON.stringify(evaluation.strengths),
    JSON.stringify(evaluation.weaknesses),
    sessionId
  );

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
  const createSystemDesignSession =
    await systemDesignDao.createSystemDesignSession(userId, prompt, topic);

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
  difficulty: "easy" | "medium" | "hard" = "medium",
  topic: string | null
): Promise<{ session: SystemDesignSession; question: string }> {
  const { question } = await systemDesignAiService.generateSystemDesignQuestion(
    difficulty,
    topic
  );

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
export async function getUserStats(
  userId: string
): Promise<UserSystemDesignStats | null> {
  // Delegate to the new consistent implementation.
  // Returning a non-null value is fine for the wider UserSystemDesignStats | null type.
  return getUserSystemDesignStats(userId);
}

export async function createCoachFeedbackForSession(
  email: string,
  sessionId: string
): Promise<SystemDesignCoachResponse> {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error(`User not found for email: ${email}`);
  }

  const session = await systemDesignDao.findSystemDesignSessionById(sessionId);
  if (!session || session.user_id !== user.id) {
    throw new Error("Session not found for this user.");
  }

  // ✅ Use prompt instead of question (most likely your column)
  const question = (session as any).question ?? (session as any).prompt;
  if (!question || !session.answer) {
    throw new Error(
      "Session does not have both question/prompt and answer stored. Submit an answer first."
    );
  }

  if (session.score == null) {
    throw new Error(
      "Session does not have a score yet. Call submit-answer before requesting coach feedback."
    );
  }

  // ✅ Normalize strengths: DB may store as string, not string[]
  const strengthsArray: string[] = Array.isArray(session.strengths)
    ? session.strengths
    : typeof session.strengths === "string" && session.strengths.startsWith("[")
    ? JSON.parse(session.strengths)
    : session.strengths
    ? [session.strengths]
    : [];

  // ✅ Normalize weaknesses similarly
  const weaknessesArray: string[] = Array.isArray(session.weaknesses)
    ? session.weaknesses
    : session.weaknesses
    ? [session.weaknesses]
    : [];

  // ✅ If you don't have a difficulty column, just default to 'medium'
  const topic = (session as any).topic ?? "general";
  const difficulty = (session as any).difficulty ?? "medium";

  // Fetch relevant resources for the topic
  const resources = await sdResourcesService.findResourcesForTopic(topic, 5);

  const coachFeedback =
    await systemDesignAiService.generateSystemDesignCoachFeedback({
      topic,
      difficulty,
      question,
      answer: session.answer,
      score: session.score,
      strengths: strengthsArray,
      weaknesses: weaknessesArray,
      resources,
    });

  return {
    sessionId: session.id,
    topic,
    difficulty,
    score: session.score,
    coachFeedback,
  };
}

export async function getUserSystemDesignStats(
  userId: string
): Promise<UserSystemDesignStats> {
  const sessions = await systemDesignDao.findSystemDesignSessionsForUser(
    userId
  );

  const totalSessions = sessions.length;
  const answered = sessions.filter((s) => s.score != null);

  const answeredSessions = answered.length;

  const averageScore =
    answeredSessions > 0
      ? answered.reduce((sum, s) => sum + (s.score ?? 0), 0) / answeredSessions
      : null;

  const lastSessionAt =
    sessions.length > 0 ? String(sessions[0].created_at) : null;

  // Group by topic for answered sessions only
  const topicMap = new Map<string, { count: number; sum: number }>();

  for (const s of answered) {
    const topic = s.topic || "unknown";
    const entry = topicMap.get(topic) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += s.score ?? 0;
    topicMap.set(topic, entry);
  }

  const topics: TopicStats[] = Array.from(topicMap.entries()).map(
    ([topic, { count, sum }]) => {
      const avg = sum / count;
      const label = labelForAverageScore(avg);
      return {
        topic,
        sessions: count,
        averageScore: avg,
        label,
      };
    }
  );

  const weakTopics = topics
    .filter((t) => t.label === "weak")
    .map((t) => t.topic);

  const strongTopics = topics
    .filter((t) => t.label === "strong")
    .map((t) => t.topic);

  let overallLevel: OverallLevel;

  if (averageScore == null) {
    overallLevel = "needs_improvement";
  } else if (averageScore < 5) {
    overallLevel = "needs_improvement";
  } else if (averageScore < 7) {
    overallLevel = "intermediate";
  } else {
    overallLevel = "strong";
  }

  return {
    userId,
    totalSessions,
    answeredSessions,
    averageScore,
    lastSessionAt,
    overallLevel,
    topics,
    weakTopics,
    strongTopics,
  };
}

function chooseDifficultyForTopic(
  stats: UserSystemDesignStats,
  topicStats: TopicStats
): Difficulty {
  const topicAvg = topicStats.averageScore ?? stats.averageScore ?? 0;

  // If we barely have data for this topic, don't throw the user into fire
  if (topicStats.sessions < 2) {
    if (topicAvg >= 7) return "medium"; // user is strong overall, but new topic
    return "easy";
  }

  // Simple, monotonic rule:
  if (topicAvg >= 7) return "hard";
  if (topicAvg >= 5) return "medium";
  return "easy";
}

export async function chooseNextTopicAndDifficultyForUser(
  userId: string
): Promise<{ topic: string; difficulty: Difficulty; reason: string }> {
  const stats = await getUserSystemDesignStats(userId);

  if (stats.answeredSessions >= 5) {
    try {
      const aiSuggestion =
        await systemDesignAiService.aiSuggestNextTopic(stats);
      return {
        topic: aiSuggestion.topic,
        difficulty: aiSuggestion.difficulty,
        reason: aiSuggestion.reason,
      };
    } catch (err) {
      console.warn(
        "AI topic agent failed, falling back to heuristics:",
        (err as Error).message
      );
    }
  }

  let topic: string;
  let difficulty: Difficulty;
  let reason: string;

  if (stats.answeredSessions === 0 || stats.topics.length === 0) {
    topic = "caching";
    difficulty = "easy";
    reason =
      "No prior history for this user. Starting with an easy caching question.";
    return { topic, difficulty, reason };
  }

  if (stats.weakTopics.length > 0) {
    const weakest = stats.topics
      .filter((t) => stats.weakTopics.includes(t.topic))
      .sort((a, b) => (a.averageScore ?? 0) - (b.averageScore ?? 0))[0];

    topic = weakest.topic;
    difficulty = chooseDifficultyForTopic(stats, weakest);
    reason = `Focusing on your weakest topic "${topic}" to improve your fundamentals. Difficulty chosen as ${difficulty} based on your topic score and overall level.`;
    return { topic, difficulty, reason };
  }

  if (stats.strongTopics.length > 0) {
    const strongest = stats.topics
      .filter((t) => stats.strongTopics.includes(t.topic))
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))[0];

    topic = strongest.topic;
    difficulty = chooseDifficultyForTopic(stats, strongest);
    reason = `You are strong in "${topic}", so we are pushing difficulty to ${difficulty} to stretch you.`;
    return { topic, difficulty, reason };
  }

  const randomTopic =
    stats.topics[Math.floor(Math.random() * stats.topics.length)].topic;

  topic = randomTopic;
  difficulty = chooseDifficultyForTopic(
    stats,
    stats.topics.find((t) => t.topic === topic)!
  );

  reason = `No clearly weak/strong topics yet. Practicing "${topic}" at ${difficulty} based on your current performance.`;

  return { topic, difficulty, reason };
}

function labelForAverageScore(avg: number): TopicLabel {
  if (avg >= 7) return "strong";
  if (avg >= 5) return "average";
  return "weak";
}
