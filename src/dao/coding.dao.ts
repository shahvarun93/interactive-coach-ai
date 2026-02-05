import { query } from "../db";
import { CodingSession } from "../interfaces/CodingSession";

export async function createCodingSession(args: {
  userId: string;
  question: string;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  language: string | null;
}): Promise<CodingSession> {
  const res = await query(
    `
    INSERT INTO coding_sessions_tbl (user_id, question, topic, difficulty, language)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    `,
    [args.userId, args.question, args.topic, args.difficulty, args.language]
  );
  return res.rows[0] as CodingSession;
}

export async function getSessionById(id: string): Promise<CodingSession | null> {
  const res = await query(
    `
    SELECT id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    FROM coding_sessions_tbl
    WHERE id = $1
    `,
    [id]
  );
  return (res.rows[0] as CodingSession) || null;
}

export async function updateCodingSession(args: {
  sessionId: string;
  code: string;
  language: string | null;
  score: number;
  strengths: string;
  weaknesses: string;
  issues: string;
  timeComplexity: string;
  spaceComplexity: string;
}): Promise<CodingSession> {
  const res = await query(
    `
    UPDATE coding_sessions_tbl
    SET code = $1,
        language = $2,
        score = $3,
        strengths = $4,
        weaknesses = $5,
        issues = $6,
        time_complexity = $7,
        space_complexity = $8,
        updated_at = now()
    WHERE id = $9
    RETURNING id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    `,
    [
      args.code,
      args.language,
      args.score,
      args.strengths,
      args.weaknesses,
      args.issues,
      args.timeComplexity,
      args.spaceComplexity,
      args.sessionId,
    ]
  );
  return res.rows[0] as CodingSession;
}

export async function listSessionsForUser(userId: string): Promise<CodingSession[]> {
  const res = await query(
    `
    SELECT id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    FROM coding_sessions_tbl
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return res.rows as CodingSession[];
}

export async function findRecentAnsweredSessionsByTopic(userId: string, topic: string, limit = 5) {
  const res = await query(
    `
    SELECT id, topic, score, weaknesses, created_at
    FROM coding_sessions_tbl
    WHERE user_id = $1
      AND topic = $2
      AND code IS NOT NULL
      AND score IS NOT NULL
    ORDER BY created_at DESC
    LIMIT $3
    `,
    [userId, topic, limit]
  );
  return res.rows;
}

export async function countCodingSessionsForUser(userId: string): Promise<number> {
  const res = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM coding_sessions_tbl
    WHERE user_id = $1
    `,
    [userId]
  );
  return res.rows[0]?.count ?? 0;
}

export async function listCodingSessionsForUserPaginated(userId: string, limit: number, offset: number): Promise<CodingSession[]> {
  const res = await query(
    `
    SELECT id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    FROM coding_sessions_tbl
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );
  return res.rows as CodingSession[];
}

export async function findLatestUnansweredSessionForUser(userId: string): Promise<CodingSession | null> {
  const res = await query(
    `
    SELECT id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    FROM coding_sessions_tbl
    WHERE user_id = $1
      AND (code IS NULL OR score IS NULL)
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return (res.rows[0] as CodingSession) || null;
}

export async function findLatestSessionForUser(userId: string): Promise<CodingSession | null> {
  const res = await query(
    `
    SELECT id, user_id, question, topic, difficulty, language, code, score, strengths, weaknesses, issues, time_complexity, space_complexity, created_at, updated_at
    FROM coding_sessions_tbl
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return (res.rows[0] as CodingSession) || null;
}
