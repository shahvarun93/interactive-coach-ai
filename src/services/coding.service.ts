import * as usersDao from "../dao/users.dao";
import * as codingDao from "../dao/coding.dao";
import * as codingAi from "./coding-ai.service";
import { getCodingSolution, saveCodingSolution } from "./coding-solution.store";
import { getCodingMetadata, saveCodingMetadata } from "./coding-metadata.store";
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

  const language = args.language ?? "JavaScript";
  const generated = await codingAi.generateCodingQuestion({
    topic,
    difficulty,
    language,
  });

  const session = await codingDao.createCodingSession({
    userId: user.id,
    question: generated.question,
    topic,
    difficulty,
    language,
  });

  await saveCodingSolution(session.id, generated.solution);
  await saveCodingMetadata(session.id, {
    language,
    boilerplate: generated.boilerplate,
    signature: generated.signature,
  });

  return {
    sessionId: session.id,
    question: generated.question,
    topic,
    difficulty,
    userId: user.id,
    boilerplate: generated.boilerplate,
    solution: generated.solution,
    signature: generated.signature,
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

  const solution = await getCodingSolution(session.id);
  const metadata = await getCodingMetadata(session.id);
  const expectedSignature = metadata?.signature ?? null;
  const userSignature = codingAi.extractSignatureFromSolution(
    args.language || session.language || "unknown",
    args.code
  );
  if (solution) {
    const normalized = (s: string) => s.replace(/\s+/g, "").trim();
    if (normalized(args.code) === normalized(solution)) {
      throw new Error("AI_SOLUTION_SUBMITTED");
    }
  }

  const evaluation = await codingAi.evaluateCodingSubmission({
    question: session.question,
    code: args.code,
    language: args.language || session.language || "unknown",
    difficulty: (session.difficulty ?? "medium") as CodingDifficulty,
    expectedSignature,
    userSignature,
  });

  const numericScore = await updateSessionWithEvaluation(
    session.id,
    args.code,
    args.language,
    evaluation
  );

  return { sessionId: session.id, evaluation: { ...evaluation, score: numericScore } };
}

export async function getCodingStats(userId: string): Promise<CodingUserStats> {
  const sessions = await codingDao.listSessionsForUser(userId);

  const totalSessions = sessions.length;
  const answered = sessions.filter((s) => s.code && s.score != null);
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
    score: s.code ? s.score : null,
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

export async function resumeLatestCodingSessionForEmail(email: string) {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const session = await codingDao.findLatestUnansweredSessionForUser(user.id);
  if (!session) {
    throw new Error("NO_ACTIVE_SESSION");
  }

  const metadata = await getCodingMetadata(session.id);
  const normalizedLang = codingAi.normalizeLanguage(session.language ?? "JavaScript");
  const signature = metadata?.signature ?? null;
  const boilerplate = signature
    ? codingAi.boilerplateForSignature(normalizedLang, signature)
    : metadata?.boilerplate ?? codingAi.boilerplateForLanguage(normalizedLang);

  const solution = await getCodingSolution(session.id);
  const evaluation = buildEvaluationFromSession(session);

  return {
    sessionId: session.id,
    question: session.question,
    topic: session.topic,
    difficulty: session.difficulty,
    language: session.language ?? "JavaScript",
    boilerplate,
    code: session.code ?? boilerplate,
    solution: solution ?? null,
    evaluation,
    signature,
  };
}

export async function getLatestCodingSessionForEmail(email: string) {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const session = await codingDao.findLatestSessionForUser(user.id);
  if (!session) {
    throw new Error("NO_SESSION");
  }

  const metadata = await getCodingMetadata(session.id);
  const normalizedLang = codingAi.normalizeLanguage(session.language ?? "JavaScript");
  const signature = metadata?.signature ?? null;
  const boilerplate = signature
    ? codingAi.boilerplateForSignature(normalizedLang, signature)
    : metadata?.boilerplate ?? codingAi.boilerplateForLanguage(normalizedLang);
  const solution = await getCodingSolution(session.id);
  const evaluation = buildEvaluationFromSession(session);

  return {
    sessionId: session.id,
    question: session.question,
    topic: session.topic,
    difficulty: session.difficulty,
    language: session.language ?? "JavaScript",
    boilerplate,
    code: session.code ?? boilerplate,
    solution: solution ?? null,
    evaluation,
    signature,
  };
}

export async function getCodingSessionForEmail(email: string, sessionId: string) {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const session = await codingDao.getSessionById(sessionId);
  if (!session || session.user_id !== user.id) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const metadata = await getCodingMetadata(session.id);
  const normalizedLang = codingAi.normalizeLanguage(session.language ?? "JavaScript");
  const signature = metadata?.signature ?? null;
  const boilerplate = signature
    ? codingAi.boilerplateForSignature(normalizedLang, signature)
    : metadata?.boilerplate ?? codingAi.boilerplateForLanguage(normalizedLang);
  const solution = await getCodingSolution(session.id);
  const evaluation = buildEvaluationFromSession(session);

  return {
    sessionId: session.id,
    question: session.question,
    topic: session.topic,
    difficulty: session.difficulty,
    language: session.language ?? "JavaScript",
    boilerplate,
    code: session.code ?? boilerplate,
    solution: solution ?? null,
    evaluation,
    signature,
  };
}

export async function getBoilerplateForSession(sessionId: string, language: string) {
  const session = await codingDao.getSessionById(sessionId);
  if (!session) {
    throw new Error("SESSION_NOT_FOUND");
  }
  const metadata = await getCodingMetadata(session.id);
  const signature = metadata?.signature ?? null;
  const normalizedLang = codingAi.normalizeLanguage(language || session.language || "JavaScript");
  const boilerplate = signature
    ? codingAi.boilerplateForSignature(normalizedLang, signature)
    : codingAi.boilerplateForLanguage(normalizedLang);

  const solution = await getCodingSolution(session.id);
  return {
    sessionId: session.id,
    language: normalizedLang,
    boilerplate,
    solutionLanguage: session.language ?? "JavaScript",
    hasSolution: Boolean(solution),
  };
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((v) => typeof v === "string");
        }
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  return [];
}

function deriveCorrectness(score: number): "correct" | "partially_correct" | "incorrect" {
  if (score >= 8) return "correct";
  if (score >= 5) return "partially_correct";
  return "incorrect";
}

async function updateSessionWithEvaluation(
  sessionId: string,
  code: string,
  language: string,
  evaluation: CodingEvaluation
) {
  const numericScore = Number(evaluation.score);
  if (!Number.isFinite(numericScore)) {
    throw new Error("INVALID_SCORE");
  }

  await codingDao.updateCodingSession({
    sessionId,
    code,
    language,
    score: numericScore,
    strengths: JSON.stringify(evaluation.strengths),
    weaknesses: JSON.stringify(evaluation.weaknesses),
    issues: JSON.stringify(evaluation.issues),
    timeComplexity: evaluation.timeComplexity,
    spaceComplexity: evaluation.spaceComplexity,
  });

  return numericScore;
}

function buildEvaluationFromSession(session: { score?: any; strengths?: any; weaknesses?: any; issues?: any; time_complexity?: any; space_complexity?: any }) {
  if (session.score == null) return null;
  const numericScore = Number(session.score);
  const correctness = Number.isFinite(numericScore) ? deriveCorrectness(numericScore) : "—";
  return {
    score: numericScore,
    correctness,
    summary: "Previously evaluated. Review strengths, weaknesses, and complexity below.",
    strengths: parseList(session.strengths),
    weaknesses: parseList(session.weaknesses),
    issues: parseList(session.issues),
    timeComplexity: session.time_complexity ?? "—",
    spaceComplexity: session.space_complexity ?? "—",
    suggestions: [],
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
