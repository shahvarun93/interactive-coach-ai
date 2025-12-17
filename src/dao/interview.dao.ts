import { query } from "../db";
import { SessionRecord, MessageRecord } from "../interfaces/Interview";

export type SessionListItem = {
  sessionId: string;
  title: string | null;
  updatedAt: string | null;
  messageCount: number;
};

export async function getSessionById(
  sessionId: string
): Promise<SessionRecord | null> {
  const res = await query(
    `
    SELECT
      id,
      status,
      created_at,
      title,
      updated_at,
      system_prompt,
      context_message_limit,
      include_transcript,
      persist_messages
    FROM sessions
    WHERE id = $1
    `,
    [sessionId]
  );

  return res.rows[0] ?? null;
}

export async function insertSession(args: {
  status?: string;
  title?: string;
  systemPrompt?: string | null;
  contextMessageLimit?: number | null;
  includeTranscript?: boolean | null;
  persistMessages?: boolean | null;
}): Promise<string> {
  const res = await query(
    `
    INSERT INTO sessions (
      status,
      title,
      system_prompt,
      context_message_limit,
      include_transcript,
      persist_messages
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [
      args.status ?? "active",
      args.title ?? "Untitled",
      args.systemPrompt ?? null,
      args.contextMessageLimit ?? 20,
      args.includeTranscript ?? true,
      args.persistMessages ?? true,
    ]
  );

  return res.rows[0].id;
}

/* ---------- Transcript ---------- */

export async function listRecentTranscript(
  sessionId: string,
  limit: number
): Promise<MessageRecord[]> {
  const res = await query(
    `
    SELECT id, session_id, role, content, metadata_json
    FROM (
      SELECT id, session_id, role, content, metadata_json, created_at
      FROM messages
      WHERE session_id = $1
        AND role IN ('user', 'assistant')
      ORDER BY created_at DESC
      LIMIT $2
    ) t
    ORDER BY created_at ASC
    `,
    [sessionId, limit]
  );

  return res.rows as MessageRecord[];
}

/* ---------- Runs ---------- */

export async function insertRun(args: {
  sessionId: string;
  globalSystemPrompt: string;
  modeSystemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  requestJson: string;
}): Promise<string> {
  const res = await query(
    `
    INSERT INTO runs (
      session_id,
      global_system_prompt,
      mode_system_prompt,
      user_prompt,
      max_output_tokens,
      request_json
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [
      args.sessionId,
      args.globalSystemPrompt,
      args.modeSystemPrompt,
      args.userPrompt,
      args.maxOutputTokens,
      args.requestJson,
    ]
  );

  return res.rows[0].id;
}

export async function updateRunResult(args: {
  runId: string;
  status: "success" | "error";
  responseText?: string;
  responseJson?: string | null;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  finishReason?: string | null;
}): Promise<void> {
  await query(
    `
    UPDATE runs
    SET status = $2,
        response_text = $3,
        response_json = $4,
        token_input = $5,
        token_output = $6,
        latency_ms = $7,
        error_code = $8,
        error_message = $9,
        finish_reason = $10
    WHERE id = $1
    `,
    [
      args.runId,
      args.status,
      args.responseText ?? null,
      args.responseJson ?? null,
      args.tokenInput ?? null,
      args.tokenOutput ?? null,
      args.latencyMs,
      args.errorCode ?? null,
      args.errorMessage ?? null,
      args.finishReason ?? null,
    ]
  );
}

/* ---------- Messages ---------- */

export async function insertMessage(args: {
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadataJson?: string | null;
}): Promise<void> {
  await query(
    `
    INSERT INTO messages (session_id, role, content, metadata_json)
    VALUES ($1, $2, $3, $4)
    `,
    [args.sessionId, args.role, args.content, args.metadataJson ?? null]
  );
}

/* ---------- Scores ---------- */

export async function insertScore(args: {
  sessionId: string;
  runId: string;
  totalScore: number;
  rubricJson: string;
  strengthsJson: string;
  weaknessesJson: string;
  actionsJson: string;
  followupsJson?: string | null;
}): Promise<void> {
  await query(
    `
    INSERT INTO scores (
      session_id,
      run_id,
      total_score,
      rubric_json,
      strengths_json,
      weaknesses_json,
      actions_json,
      followups_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      args.sessionId,
      args.runId,
      args.totalScore,
      args.rubricJson,
      args.strengthsJson,
      args.weaknessesJson,
      args.actionsJson,
      args.followupsJson ?? null,
    ]
  );
}

export async function getLatestSessionSummary(sessionId: string) {
  const r = await query(
    `select id, session_id, summary_text, last_message_id, created_at
     from summaries
     where session_id = $1
     order by created_at desc
     limit 1`,
    [sessionId]
  );
  return r.rows[0] ?? null;
}

export async function insertSessionSummary(params: {
  sessionId: string;
  summaryText: string;
  lastMessageId: string | null;
}) {
  const r = await query(
    `insert into summaries (session_id, summary_text, last_message_id)
     values ($1, $2, $3)
     returning id`,
    [params.sessionId, params.summaryText, params.lastMessageId]
  );
  return r.rows[0].id as number;
}

// Count messages to decide if we should summarize (cheap)
export async function countMessages(sessionId: string) {
  const r = await query(
    `select count(*)::int as c from messages where session_id = $1`,
    [sessionId]
  );
  return r.rows[0]?.c ?? 0;
}

export async function listMessagesForSummarization(params: {
  sessionId: string;
  afterMessageId: string | null;
  limit: number;
}) {
  const r = await query(
    `
    SELECT id, role, content, created_at
    FROM messages
    WHERE session_id = $1
      AND ($2::uuid IS NULL OR id > $2::uuid)
    ORDER BY created_at ASC
    LIMIT $3
    `,
    [params.sessionId, params.afterMessageId, params.limit]
  );

  return r.rows as Array<{ id: string; role: string; content: string }>;
}

export async function listSessions(params: {
  limit?: number;
  cursorUpdatedAt?: string | null; // ISO string
  cursorId?: string | null; // uuid
}): Promise<{
  sessions: SessionListItem[];
  nextCursor: { updatedAt: string; id: string } | null;
}> {
  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 50)));

  const sql = `
    SELECT
      s.id AS session_id,
      s.title,
      s.updated_at,
      COALESCE(m.message_count, 0) AS message_count
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(*)::int AS message_count
      FROM messages
      GROUP BY session_id
    ) m ON m.session_id = s.id
    WHERE
      ($2::timestamptz IS NULL OR $3::uuid IS NULL)
      OR (s.updated_at, s.id) < ($2::timestamptz, $3::uuid)
    ORDER BY s.updated_at DESC, s.id DESC
    LIMIT $1;
  `;

  const res = await query(sql, [
    limit,
    params.cursorUpdatedAt ?? null,
    params.cursorId ?? null,
  ]);

  const sessions: SessionListItem[] = (res.rows ?? []).map((r: any) => ({
    sessionId: String(r.session_id),
    title: typeof r.title === "string" ? r.title : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    messageCount: Number(r.message_count ?? 0),
  }));

  const last = sessions[sessions.length - 1];
  const nextCursor =
    last && last.updatedAt
      ? { updatedAt: last.updatedAt, id: last.sessionId }
      : null;

  return { sessions, nextCursor };
}

export async function deleteSession(
  sessionId: string
): Promise<{ deleted: boolean }> {
  const sql = `
    DELETE FROM sessions
    WHERE id = $1
    RETURNING id;
  `;

  const res = await query(sql, [sessionId]);
  return { deleted: (res.rows?.length ?? 0) > 0 };
}
