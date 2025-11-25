import { query } from '../db';
import { SystemDesignSession } from '../interfaces/SystemDesignSession';
import { UserTopicStatsRow } from '../interfaces/UserTopicStatsRow';
import { UserStatsRow } from '../interfaces/UserStatsRow';
import { SystemDesignSessionRow } from '../interfaces/SystemDesignSessionRow';

export async function createSystemDesignSession(
    userId: string,
    prompt: string,
    topic: string | null
): Promise<SystemDesignSession> {
    const res = await query(
      `
      INSERT INTO system_design_sessions_tbl (user_id, prompt, topic)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at, topic
      `,
      [userId, prompt, topic]
    );
  
    return res.rows[0] as SystemDesignSession;
}
  
export async function listSessionsForUser(
    userId: string
): Promise<SystemDesignSession[]> {
    const res = await query(
      `
      SELECT id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at, topic
      FROM system_design_sessions_tbl
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );
  
    return res.rows as SystemDesignSession[];
}

export async function getSessionById(
  id: string
): Promise<SystemDesignSession | null> {
  const res = await query(
    `
    SELECT id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at, topic
    FROM system_design_sessions_tbl
    WHERE id = $1
    `,
    [id]
  );
  return (res.rows[0] as SystemDesignSession) || null;
}

export async function updateSystemDesignSessions(
  answer: string, 
  evalScore: number, 
  strengths: String, 
  weaknesses: String, 
  sessionId: String
) : Promise<SystemDesignSession | null> {
  const res = await query(
    `
    UPDATE system_design_sessions_tbl
    SET answer = $1,
        score = $2,
        strengths = $3,
        weaknesses = $4,
        updated_at = now()
    WHERE id = $5
    RETURNING id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at, topic
    `,
    [
      answer,
      evalScore,
      strengths,
      weaknesses,
      sessionId,
    ]
  );
  return res.rows[0] as SystemDesignSession;
}

export async function findUserStatsRow(
  userId: string
): Promise<UserStatsRow | null> {
  const res = await query(
    `
    SELECT 
      u.id AS user_id,
      COUNT(s.id) AS total_sessions,
      COUNT(s.answer) AS answered_sessions,
      AVG(s.score) AS average_score,
      MAX(s.created_at) AS last_session_at
    FROM users_tbl u
    LEFT JOIN system_design_sessions_tbl s ON s.user_id = u.id
    WHERE u.id = $1
    GROUP BY u.id
    `,
    [userId]
  );

  if (res.rows.length === 0) return null;
  return res.rows[0] as UserStatsRow;
}

export async function findUserTopicStatsRows(
  userId: string
): Promise<UserTopicStatsRow[]> {
  const res = await query(
    `
    SELECT 
      s.topic,
      COUNT(s.id) AS total_sessions,
      AVG(s.score) AS average_score
    FROM system_design_sessions_tbl s
    WHERE s.user_id = $1
    GROUP BY s.topic
    ORDER BY s.topic NULLS LAST
    `,
    [userId]
  );

  return res.rows as UserTopicStatsRow[];
}

export async function findSystemDesignSessionById(
  sessionId: string
): Promise<SystemDesignSession | null> {
  const sql = `
    SELECT *
    FROM system_design_sessions_tbl
    WHERE id = $1
  `;
  const result = await query(sql, [sessionId]);
  return result.rows[0] ?? null;
}

// If you later want “coach me on my latest attempt”:
export async function findLatestSystemDesignSessionForUser(
  userId: string
): Promise<SystemDesignSession | null> {
  const sql = `
    SELECT *
    FROM system_design_sessions_tbl
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const result = await query(sql, [userId]);
  return result.rows[0] ?? null;
}

export async function findSystemDesignSessionsForUser(
  userId: string
): Promise<SystemDesignSession[]> {
  const sql = `
    SELECT id, user_id, topic, score, created_at
    FROM system_design_sessions_tbl
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;
  const result = await query(sql, [userId]);
  return result.rows;
}

export async function findSystemDesignSessionsForUserPaginated(
  userId: string,
  limit: number,
  offset: number
): Promise<SystemDesignSession[]> {
  const sql = `
    SELECT
      id,
      user_id,
      prompt,
      answer,
      score,
      strengths,
      weaknesses,
      created_at,
      updated_at,
      topic
    FROM system_design_sessions_tbl
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const { rows } = await query(sql, [userId, limit, offset]);
  return rows as SystemDesignSession[];
}

export async function countSystemDesignSessionsForUser(
  userId: string
): Promise<number> {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM system_design_sessions_tbl
    WHERE user_id = $1
  `;
  const { rows } = await query(sql, [userId]);
  return rows[0]?.count ?? 0;
}

export async function findRecentAnsweredSessionsByTopic(
  userId: string,
  topic: string,
  limit = 5
) {
  const result = await query(
    `
    SELECT id, topic, score, weaknesses, created_at
    FROM system_design_sessions_tbl
    WHERE user_id = $1
      AND topic = $2
      AND answer IS NOT NULL
      AND score IS NOT NULL
    ORDER BY created_at DESC
    LIMIT $3
    `,
    [userId, topic, limit]
  );

  return result.rows;
}