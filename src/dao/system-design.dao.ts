import { query } from '../db';
import { SystemDesignSession } from '../interfaces/SystemDesignSession';
import { UserStats } from '../interfaces/UserStats';
import { UserStatsRow } from '../interfaces/UserStatsRow';

export async function createSystemDesignSession(
    userId: string,
    prompt: string
): Promise<SystemDesignSession> {
    const res = await query(
      `
      INSERT INTO system_design_sessions_tbl (user_id, prompt)
      VALUES ($1, $2)
      RETURNING id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at
      `,
      [userId, prompt]
    );
  
    return res.rows[0] as SystemDesignSession;
}
  
export async function listSessionsForUser(
    userId: string
): Promise<SystemDesignSession[]> {
    const res = await query(
      `
      SELECT id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at
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
    SELECT id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at
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
    RETURNING id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at
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
    LEFT JOIN system_design_sessions s ON s.user_id = u.id
    WHERE u.id = $1
    GROUP BY u.id
    `,
    [userId]
  );

  if (res.rows.length === 0) return null;
  return res.rows[0] as UserStatsRow;
}