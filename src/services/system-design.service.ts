// src/services/system-design.service.ts
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
import * as systemDesignResourcesService from "./sd-resources.service";
import { TopicMistakePatterns } from "../interfaces/TopicMistakes";
import { SystemDesignStudyPlan } from "../interfaces/SystemDesignStudyPlan";
import { SDResource } from "../interfaces/SDResource";
import { CACHE_DEBUG, cacheGet, cacheSet } from "../infra/redis";
import { SystemDesignHistoryItem, SystemDesignHistoryPage } from "../interfaces/SystemDesignHistory";
import {
  CreateAISystemDesignSessionResult,
  ChooseNextTopicAndDifficultyResult,
  ResourcesByTopic,
  ResourceItem,
} from "../interfaces/SystemDesignService";

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
  difficulty: Difficulty = "medium",
  topic: string | null
): Promise<CreateAISystemDesignSessionResult> {
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

// cache the coach feedback per (session) so re-clicking “Get Coach Feedback” doesn’t call OpenAI again.
export async function createCoachFeedbackForSession(
  email: string,
  sessionId: string
): Promise<SystemDesignCoachResponse> {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const session = await systemDesignDao.findSystemDesignSessionById(sessionId);
  if (!session || session.user_id !== user.id) {
    throw new Error("SESSION_NOT_FOUND");
  }

  // 🔹 Coach cache: key per session + score (so if you change the answer/score, key changes)
  const updatedAtKeyPart = session.updated_at ?? "no-updated-at";

  const coachCacheKey = `sd:coach:${session.id}:${session.score}:${updatedAtKeyPart}`;

  const cached = await cacheGet<SystemDesignCoachResponse>(coachCacheKey);
  if (cached) {
    if (CACHE_DEBUG) {
      console.log("[coach] cache HIT", {
        sessionId: session.id,
        score: session.score,
        updatedAt: updatedAtKeyPart,
      });
    }
    return cached;
  }
  if (CACHE_DEBUG) {
    console.log("[coach] cache MISS", {
      sessionId: session.id,
      score: session.score,
      updatedAt: updatedAtKeyPart,
    });
  }

  // ✅ Use prompt instead of question (most likely your column)
  const question = (session as any).question ?? (session as any).prompt;
  if (!question) {
    throw new Error(
      "Session does not have both question/prompt and answer stored. Submit an answer first."
    );
  }
  if (!session.answer || session.score == null) {
    throw new Error("ANSWER_NOT_FOUND");
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
    : typeof session.weaknesses === "string" &&
      session.weaknesses.startsWith("[")
    ? JSON.parse(session.weaknesses)
    : session.weaknesses
    ? [session.weaknesses]
    : [];

  // ✅ If you don't have a difficulty column, just default to 'medium'
  const topic = (session as any).topic ?? "general";
  const difficulty = (session as any).difficulty ?? "medium";

  const TOPIC_ALIASES: Record<string, string> = {
    "rate-limiting": "rate-limiting",
    "rate limiting": "rate-limiting",
    "rate-limit": "rate-limiting",
    queues: "messaging",
    queue: "messaging",
    "message-queues": "messaging",
    "message queues": "messaging",
    feed: "feeds",
    "news-feed": "feeds",
    "news feed": "feeds",
  };
  function normalizeTopic(t: string) {
    const key = (t || "unknown").trim().toLowerCase().replace(/\s+/g, "-");
    return TOPIC_ALIASES[key] || key;
  }
  const normalizedTopic = normalizeTopic(topic);

  const topicMistakePatterns = await buildTopicMistakePatternsForUser(
    user.id,
    topic,
    5
  );

  // Fetch relevant resources for the topic
  const resources = await systemDesignResourcesService.findResourcesForTopic(
    normalizedTopic,
    5
  );

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
      topicMistakePatterns,
    });

  const resourcesPayload = resources.map((r: any): ResourceItem & { topic: string; contentSnippet: string } => ({
    id: r.id,
    title: r.title,
    url: r.url ?? null,
    topic: r.topic,
    contentSnippet:
      typeof r.content === "string" ? r.content.slice(0, 160) + "..." : "",
  }));

  const response = {
    sessionId: session.id,
    topic,
    difficulty,
    score: session.score,
    coachFeedback,
    resources: resourcesPayload,
  };
  await cacheSet<SystemDesignCoachResponse>(coachCacheKey, response);
  if (CACHE_DEBUG) {
    console.log("[coach] cache SET", {
      sessionId: session.id,
      key: coachCacheKey,
    });
  }
  return response;
}

export async function getUserSystemDesignStats(
  userId: string
): Promise<UserSystemDesignStats> {
  const cacheKey = `sd:stats:${userId}`;

  const cached = await cacheGet<UserSystemDesignStats>(cacheKey);
  if (cached) {
    // Optional logging
    // console.log("[stats] cache hit for", userId);
    return cached;
  }

  const sessions = await systemDesignDao.findSystemDesignSessionsForUser(
    userId
  );

  const totalSessions = sessions.length;
  sessions.sort(
    (a, b) =>
      new Date(String(b.created_at)).getTime() -
      new Date(String(a.created_at)).getTime()
  );

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
): Promise<ChooseNextTopicAndDifficultyResult> {
  const stats = await getUserSystemDesignStats(userId);

  if (stats.answeredSessions >= 5) {
    try {
      const aiSuggestion = await systemDesignAiService.aiSuggestNextTopic(
        stats
      );
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

export async function buildTopicMistakePatternsForUser(
  userId: string,
  topic: string,
  limit = 5
): Promise<TopicMistakePatterns> {
  const sessions = await systemDesignDao.findRecentAnsweredSessionsByTopic(
    userId,
    topic,
    limit
  );

  if (!sessions.length) {
    return { sessionsConsidered: 0, recurringMistakes: [] };
  }

  const freq: Record<string, number> = {};

  for (const s of sessions) {
    let weaknesses: string[] = [];

    if (Array.isArray(s.weaknesses)) {
      weaknesses = s.weaknesses;
    } else if (
      typeof s.weaknesses === "string" &&
      s.weaknesses.startsWith("[")
    ) {
      try {
        weaknesses = JSON.parse(s.weaknesses);
      } catch {
        weaknesses = [s.weaknesses];
      }
    } else if (typeof s.weaknesses === "string" && s.weaknesses.trim()) {
      weaknesses = [s.weaknesses];
    }

    for (const w of weaknesses) {
      const key = w.trim().toLowerCase();
      if (!key) continue;
      freq[key] = (freq[key] || 0) + 1;
    }
  }

  const recurringMistakes = Object.entries(freq)
    .filter(([, count]) => count >= 2) // appears at least twice
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mistake, count]) => ({ mistake, count }));

  return {
    sessionsConsidered: sessions.length,
    recurringMistakes,
  };
}

export async function getSystemDesignPlanForUser(
  userId: string
): Promise<SystemDesignStudyPlan> {
  const stats = await getUserSystemDesignStats(userId);
  // stats already has: overallLevel, weakTopics, strongTopics, topics[]

  // 2) Use lastSessionAt as part of the cache key
  const lastKeyPart = stats.lastSessionAt
    ? new Date(stats.lastSessionAt).getTime() // or stats.lastSessionAt as-is
    : "no-sessions";

  const cacheKey = `sd:plan:${userId}:${lastKeyPart}`;

  const cachedPlan = await cacheGet<SystemDesignStudyPlan>(cacheKey);
  if (cachedPlan) {
    if (CACHE_DEBUG) {
      console.log("[study-plan] cache HIT", { userId, cacheKey });
    }
    return cachedPlan;
  }

  if (CACHE_DEBUG) {
    console.log("[study-plan] cache MISS", { userId, cacheKey });
  }

  // Pull a few resources for each weak topic
  // Pull a few *semantically relevant* resources for each weak topic (RAG)
  const resourcesByTopic: ResourcesByTopic = {};

  for (const topic of stats.weakTopics || []) {
    const normalizedTopic = topic; // reuse your topic normalization if needed

    // Build a short query text representing the user's situation for this topic
    const queryText = [
      `System design interview notes about ${normalizedTopic}.`,
      `User overall level: ${stats.overallLevel}.`,
      stats.averageScore
        ? `User average score: ${stats.averageScore.toFixed(1)}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    try {
      // 2) Semantic search in sd_resources using pgvector
      const resources: SDResource[] =
        await systemDesignAiService.getRagResourcesForTopic(
          queryText,
          normalizedTopic
        );

      // 3) Map to the simple shape expected by the AI service
      resourcesByTopic[topic] = resources.map((r): ResourceItem => ({
        id: r.id,
        title: r.title,
        url: r.url ?? null,
      }));
    } catch (err) {
      console.warn(
        "[study-plan RAG] Failed for topic",
        topic,
        (err as Error).message
      );
      // Optional fallback: if RAG fails, you can still use simple topic-based resources
      const fallbackResources =
        await systemDesignResourcesService.findResourcesForTopic(
          normalizedTopic,
          3
        );
      resourcesByTopic[topic] = fallbackResources.map((r: any): ResourceItem => ({
        id: r.id,
        title: r.title,
        url: r.url ?? null,
      }));
    }
  }

  const plan = await systemDesignAiService.generateSystemDesignStudyPlan({
    stats,
    resourcesByTopic,
  });
  // 🔹 4) Store in cache (uses default TTL from redis.ts)
  await cacheSet<SystemDesignStudyPlan>(cacheKey, plan);
  if (CACHE_DEBUG) {
    console.log("[study-plan] cache SET", { userId, cacheKey });
  }
  return plan;
}

export async function getSystemDesignHistoryForUser(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<SystemDesignHistoryPage> {
  const safePage = page < 1 ? 1 : page;
  const safePageSize = pageSize > 50 ? 50 : pageSize; // cap to avoid abuse
  const offset = (safePage - 1) * safePageSize;

  const [total, sessions] = await Promise.all([
    systemDesignDao.countSystemDesignSessionsForUser(userId),
    systemDesignDao.findSystemDesignSessionsForUserPaginated(userId, safePageSize, offset),
  ]);

  const items: SystemDesignHistoryItem[] = sessions.map((s) => ({
    id: s.id,
    topic: s.topic ?? "unknown",
    question: s.prompt ?? "",
    answerPreview: s.answer
      ? s.answer.length > 200
        ? s.answer.slice(0, 200) + "..."
        : s.answer
      : null,
    score: s.score,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));

  return {
    userId,
    total,
    page: safePage,
    pageSize: safePageSize,
    items,
  };
}

function labelForAverageScore(avg: number): TopicLabel {
  if (avg >= 7) return "strong";
  if (avg >= 5) return "average";
  return "weak";
}
