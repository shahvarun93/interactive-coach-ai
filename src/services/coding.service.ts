import * as usersDao from "../dao/users.dao";
import * as codingDao from "../dao/coding.dao";
import * as codingAi from "./coding-ai.service";
import { CodingEvaluation } from "../interfaces/CodingEvaluation";
import {
  CodingDifficulty,
  CodingUserStats,
  CodingTopicStats,
  CodingHistoryPage,
} from "../interfaces/CodingStats";

const DEFAULT_TOPIC_POOL = [
  "arrays",
  "strings",
  "hashing",
  "two-pointers",
  "sorting",
  "intervals",
  "trees",
  "graphs",
  "heaps",
  "greedy",
  "dynamic-programming",
  "backtracking",
  "math",
  "bit-manipulation",
];

export async function createCodingSessionForUser(args: {
  email: string;
  topic?: string;
  difficulty?: CodingDifficulty;
  language?: string | null;
}) {
  const email = args.email.trim();
  let user = await usersDao.findUserByEmail(email);
  if (!user) {
    user = await usersDao.createUser(email);
  }

  const stats = await getCodingStats(user.id);

  const { topic, difficulty } = await chooseNextTopicAndDifficulty(stats, args.topic, args.difficulty);

  const question = await codingAi.generateCodingQuestion({
    topic,
    difficulty,
  });

  const session = await codingDao.createCodingSession({
    userId: user.id,
    question,
    topic,
    difficulty,
    language: args.language ?? null,
  });

  return {
    sessionId: session.id,
    question,
    topic,
    difficulty,
    userId: user.id,
  };
}

export async function submitCodingSolution(args: {
  sessionId: string;
  code: string;
  language: string;
}): Promise<{ sessionId: string; evaluation: CodingEvaluation }> {
  const session = await codingDao.getSessionById(args.sessionId);
  if (!session) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const evaluation = await codingAi.evaluateCodingSubmission({
    question: session.question,
    code: args.code,
    language: args.language || session.language || "unknown",
    difficulty: (session.difficulty ?? "medium") as CodingDifficulty,
  });

  await codingDao.updateCodingSession({
    sessionId: session.id,
    code: args.code,
    language: args.language,
    score: evaluation.score,
    strengths: JSON.stringify(evaluation.strengths),
    weaknesses: JSON.stringify(evaluation.weaknesses),
    issues: JSON.stringify(evaluation.issues),
    timeComplexity: evaluation.timeComplexity,
    spaceComplexity: evaluation.spaceComplexity,
  });

  return { sessionId: session.id, evaluation };
}

export async function getCodingStats(userId: string): Promise<CodingUserStats> {
  const sessions = await codingDao.listSessionsForUser(userId);

  const totalSessions = sessions.length;
  const answered = sessions.filter((s) => s.score != null);
  const answeredSessions = answered.length;
  const averageScore =
    answeredSessions > 0
      ? answered.reduce((sum, s) => sum + (s.score ?? 0), 0) / answeredSessions
      : null;

  const lastSessionAt = sessions.length > 0 ? String(sessions[0].created_at) : null;

  const topicMap = new Map<string, { count: number; sum: number }>();
  for (const s of answered) {
    const topic = s.topic || "unknown";
    const entry = topicMap.get(topic) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += s.score ?? 0;
    topicMap.set(topic, entry);
  }

  const topics: CodingTopicStats[] = Array.from(topicMap.entries()).map(
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

  return {
    userId,
    totalSessions,
    answeredSessions,
    averageScore,
    lastSessionAt,
    topics,
    weakTopics,
    strongTopics,
  };
}

export async function getCodingHistoryForUser(
  userId: string,
  page = 1,
  pageSize = 10
): Promise<CodingHistoryPage> {
  const safePage = page < 1 ? 1 : page;
  const safePageSize = pageSize > 50 ? 50 : pageSize;
  const offset = (safePage - 1) * safePageSize;

  const [total, sessions] = await Promise.all([
    codingDao.countCodingSessionsForUser(userId),
    codingDao.listCodingSessionsForUserPaginated(userId, safePageSize, offset),
  ]);

  const items = sessions.map((s) => ({
    id: s.id,
    topic: s.topic ?? "unknown",
    difficulty: (s.difficulty ?? "—") as CodingDifficulty | "—",
    question: s.question,
    score: s.score,
    createdAt: s.created_at,
  }));

  return {
    userId,
    total,
    page: safePage,
    pageSize: safePageSize,
    items,
  };
}

function labelForAverageScore(avg: number) {
  if (avg >= 7) return "strong" as const;
  if (avg >= 5) return "average" as const;
  return "weak" as const;
}

function chooseDifficultyForTopic(topicStats: CodingTopicStats | null, overallAvg: number | null): CodingDifficulty {
  const avg = topicStats?.averageScore ?? overallAvg ?? 0;
  if (topicStats && topicStats.sessions < 2) {
    return avg >= 7 ? "medium" : "easy";
  }
  if (avg >= 7) return "hard";
  if (avg >= 5) return "medium";
  return "easy";
}

async function chooseNextTopicAndDifficulty(
  stats: CodingUserStats,
  preferredTopic?: string,
  preferredDifficulty?: CodingDifficulty
) {
  if (preferredTopic && preferredDifficulty) {
    return { topic: preferredTopic, difficulty: preferredDifficulty };
  }

  if (stats.answeredSessions === 0) {
    return { topic: preferredTopic ?? "arrays", difficulty: "easy" as CodingDifficulty };
  }

  if (stats.weakTopics.length > 0) {
    const weakest = stats.topics
      .filter((t) => stats.weakTopics.includes(t.topic))
      .sort((a, b) => a.averageScore - b.averageScore)[0];

    return {
      topic: preferredTopic ?? weakest.topic,
      difficulty: preferredDifficulty ?? chooseDifficultyForTopic(weakest, stats.averageScore),
    };
  }

  if (stats.strongTopics.length > 0) {
    const strongest = stats.topics
      .filter((t) => stats.strongTopics.includes(t.topic))
      .sort((a, b) => b.averageScore - a.averageScore)[0];

    return {
      topic: preferredTopic ?? strongest.topic,
      difficulty: preferredDifficulty ?? chooseDifficultyForTopic(strongest, stats.averageScore),
    };
  }

  const pool = DEFAULT_TOPIC_POOL.filter(Boolean);
  const randomTopic = pool[Math.floor(Math.random() * pool.length)] || "arrays";
  const topicStats = stats.topics.find((t) => t.topic === randomTopic) ?? null;

  return {
    topic: preferredTopic ?? randomTopic,
    difficulty: preferredDifficulty ?? chooseDifficultyForTopic(topicStats, stats.averageScore),
  };
}
