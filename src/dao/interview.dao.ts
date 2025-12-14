import { query } from "../db";
import {
  SessionRecord,
  MessageRecord,
} from "../interfaces/Interview";

/* ---------- Sessions ---------- */

export async function getSessionById(
  sessionId: string
): Promise<SessionRecord | null> {
  const res = await query(
    `
    SELECT id, mode_id, persona, seniority, status
    FROM sessions
    WHERE id = $1
    `,
    [sessionId]
  );

  return res.rows[0] ?? null;
}

export async function insertSession(args: {
  modeId: "coding" | "system_design";
  persona?: string;
  seniority?: string;
  status?: string;
}): Promise<string> {
  const res = await query(
    `
    INSERT INTO sessions (mode_id, persona, seniority, status)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [
      args.modeId,
      args.persona ?? "realistic",
      args.seniority ?? "senior",
      args.status ?? "active",
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
    FROM messages
    WHERE session_id = $1
      AND role IN ('user', 'assistant')
    ORDER BY created_at DESC
    LIMIT $2
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
  status: "ok" | "error";
  responseText?: string;
  responseJson?: string | null;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
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
        error_message = $9
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
     from interview_session_summaries_tbl
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
  lastMessageId: number | null;
}) {
  const r = await query(
    `insert into interview_session_summaries_tbl (session_id, summary_text, last_message_id)
     values ($1, $2, $3)
     returning id`,
    [params.sessionId, params.summaryText, params.lastMessageId]
  );
  return r.rows[0].id as number;
}

// Count messages to decide if we should summarize (cheap)
export async function countMessages(sessionId: string) {
  const r = await query(
    `select count(*)::int as c from interview_messages_tbl where session_id = $1`,
    [sessionId]
  );
  return r.rows[0]?.c ?? 0;
}

// Fetch “older slice” to summarize (messages after last summary up to a cap)
export async function listMessagesForSummarization(params: {
  sessionId: string;
  afterMessageId: number | null;
  limit: number; // e.g., 30-60
}) {
  const r = await query(
    `select id, role, content, created_at
     from interview_messages_tbl
     where session_id = $1
       and ($2::bigint is null or id > $2::bigint)
     order by id asc
     limit $3`,
    [params.sessionId, params.afterMessageId, params.limit]
  );
  return r.rows as Array<{ id: number; role: string; content: string }>;
}