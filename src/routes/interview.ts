import { Router } from "express";
import * as orchestrator from "../services/interviewOrchestrator.service";

const router = Router();

function parseLimit(q: any, fallback: number) {
  const n = Number(q);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(200, Math.floor(n)));
}

/**
 * Create session
 * POST /api/v1/interview/sessions
 */
router.post("/sessions", async (req, res) => {
  try {
    const body = req.body ?? {};

    const result = await orchestrator.createSession({
      title: typeof body.title === "string" ? body.title : undefined,
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt : null,
      contextMessageLimit:
        typeof body.contextMessageLimit === "number" ? body.contextMessageLimit : null,
      maxOutputTokens:
        typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : null,
      includeTranscript:
        typeof body.includeTranscript === "boolean" ? body.includeTranscript : null,
      persistMessages:
        typeof body.persistMessages === "boolean" ? body.persistMessages : null,
    });

    return res.status(201).json(result);
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/**
 * List sessions (history)
 * GET /api/v1/interview/sessions?limit=50&cursorUpdatedAt=...&cursorId=...
 */
router.get("/sessions", async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const cursorUpdatedAt =
      typeof req.query.cursorUpdatedAt === "string" ? req.query.cursorUpdatedAt : null;
    const cursorId = typeof req.query.cursorId === "string" ? req.query.cursorId : null;

    const result = await orchestrator.listSessions({
      limit,
      cursorUpdatedAt,
      cursorId,
    });

    return res.json(result);
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/**
 * Session details (+ optional transcript)
 * GET /api/v1/interview/sessions/:sessionId?includeTranscript=true&limit=20
 */
router.get("/sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const includeTranscript = String(req.query.includeTranscript || "") === "true";
    const limit = parseLimit(req.query.limit, 20);

    // Preferred single endpoint for UI hydration
    const result = await orchestrator.getSession({
      sessionId,
      includeTranscript,
      limit,
    });

    return res.json(result);
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/**
 * Messages only (alias endpoint for UI hydration)
 * GET /api/v1/interview/sessions/:sessionId/messages?limit=20
 */
router.get("/sessions/:sessionId/messages", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseLimit(req.query.limit, 20);

    const messages = await orchestrator.getSessionMessages({ sessionId, limit });
    return res.json({ messages });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/**
 * Transcript only (alias endpoint for UI hydration)
 * GET /api/v1/interview/sessions/:sessionId/transcript?limit=20
 */
router.get("/sessions/:sessionId/transcript", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseLimit(req.query.limit, 20);

    const transcript = await orchestrator.getSessionMessages({ sessionId, limit });
    return res.json({ transcript });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/**
 * Delete session (hard delete + cascade)
 * DELETE /api/v1/interview/sessions/:sessionId
 */
router.delete("/sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await orchestrator.deleteSession({ sessionId });

    return res.json(result);
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/**
 * Streaming run (SSE)
 * POST /api/v1/interview/sessions/:sessionId/runs/stream
 */
router.post("/sessions/:sessionId/runs/stream", async (req, res) => {
  const { sessionId } = req.params;
  const dto = req.body;

  const messages = Array.isArray(dto?.messages) ? dto.messages : null;
  const last = messages && messages.length ? messages[messages.length - 1] : null;

  if (!messages || !messages.length) {
    return res.status(400).json({ error: "messages[] is required." });
  }

  if (
    !last ||
    last.role !== "user" ||
    typeof last.content !== "string" ||
    !last.content.trim()
  ) {
    return res
      .status(400)
      .json({ error: "Last message must be a non-empty user message." });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const hb = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => clearInterval(hb));

  try {
    const { runId, stream, finalize } = await orchestrator.streamTurn({
      sessionId,
      dto,
    });

    res.write(`event: meta\ndata: ${JSON.stringify({ runId })}\n\n`);

    let fullText = "";
    for await (const chunk of stream) {
      if (typeof chunk !== "string" || !chunk.length) continue;
      fullText += chunk;
      res.write(`event: delta\ndata: ${JSON.stringify({ delta: chunk })}\n\n`);
    }

    const done = await finalize(fullText);
    res.write(`event: done\ndata: ${JSON.stringify(done)}\n\n`);
    return res.end();
  } catch (e) {
    res.write(
      `event: error\ndata: ${JSON.stringify({
        message: e instanceof Error ? e.message : String(e),
      })}\n\n`
    );
    return res.end();
  }
});

/**
 * Non-stream run
 * POST /api/v1/interview/sessions/:sessionId/runs
 */
router.post("/sessions/:sessionId/runs", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const dto = req.body;

    const messages = Array.isArray(dto?.messages) ? dto.messages : null;
    const last = messages && messages.length ? messages[messages.length - 1] : null;

    if (!messages || !messages.length) {
      return res.status(400).json({ error: "messages[] is required." });
    }

    if (
      !last ||
      last.role !== "user" ||
      typeof last.content !== "string" ||
      !last.content.trim()
    ) {
      return res
        .status(400)
        .json({ error: "Last message must be a non-empty user message." });
    }

    const result = await orchestrator.runTurn({ sessionId, dto });
    return res.json(result);
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

export default router;