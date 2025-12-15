import { Router } from "express";
import * as orchestrator from "../services/interviewOrchestrator.service";

const router = Router();

/**
 * Create session
 * POST /api/v1/interview/sessions
 */
router.post("/sessions", async (req, res) => {
  try {
    const body = req.body ?? {};
    const modeId = body.modeId;

    if (modeId !== "coding" && modeId !== "system_design") {
      return res
        .status(400)
        .json({ error: "modeId must be 'coding' or 'system_design'." });
    }

    const result = await orchestrator.createSession({
      modeId,
      persona: typeof body.persona === "string" ? body.persona : undefined,
      seniority: typeof body.seniority === "string" ? body.seniority : undefined,
    });

    return res.status(201).json(result);
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

  if (!last || last.role !== "user" || typeof last.content !== "string" || !last.content.trim()) {
    return res.status(400).json({ error: "Last message must be a non-empty user message." });
  }

  res.setHeader("Content-Type", "text/event-stream");
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
      fullText += chunk;
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
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

    if (!last || last.role !== "user" || typeof last.content !== "string" || !last.content.trim()) {
      return res.status(400).json({ error: "Last message must be a non-empty user message." });
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
