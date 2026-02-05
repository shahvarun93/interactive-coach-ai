import { Router } from "express";
import * as codingService from "../services/coding.service";
import * as usersService from "../services/users.service";

const router = Router();

router.post("/generate-prompt", async (req, res) => {
  try {
    const { email, topic, difficulty, language } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    const result = await codingService.createCodingSessionForUser({
      email,
      topic,
      difficulty,
      language,
    });

    return res.json(result);
  } catch (err: any) {
    console.error("Error generating coding prompt:", err);
    return res.status(500).json({ error: "Failed to generate coding prompt" });
  }
});

router.post("/submit-solution", async (req, res) => {
  try {
    const { sessionId, code, language } = req.body || {};
    if (!sessionId || !code) {
      return res.status(400).json({ error: "sessionId and code are required" });
    }

    const result = await codingService.submitCodingSolution({
      sessionId,
      code,
      language: language || "unknown",
    });

    return res.json({
      sessionId: result.sessionId,
      score: result.evaluation.score,
      evaluation: result.evaluation,
    });
  } catch (err: any) {
    console.error("Error submitting coding solution:", err);
    if (err.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ error: "Session not found" });
    }
    if (err.message === "AI_SOLUTION_SUBMITTED") {
      return res.status(403).json({ error: "AI solution submission is not allowed." });
    }
    return res.status(500).json({ error: "Failed to submit solution" });
  }
});

router.get("/stats/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const user = await usersService.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const stats = await codingService.getCodingStats(user.id);
    return res.json(stats);
  } catch (err: any) {
    console.error("Error fetching coding stats:", err);
    return res.status(500).json({ error: "Failed to fetch coding stats" });
  }
});

router.get("/history/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize
      ? parseInt(req.query.pageSize as string, 10)
      : 10;

    const user = await usersService.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const history = await codingService.getCodingHistoryForUser(
      user.id,
      page,
      pageSize
    );

    return res.json(history);
  } catch (err: any) {
    console.error("Error fetching coding history:", err);
    return res.status(500).json({ error: "Failed to fetch coding history" });
  }
});

router.get("/resume/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await codingService.resumeLatestCodingSessionForEmail(email);
    return res.json(result);
  } catch (err: any) {
    if (err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "User not found" });
    }
    if (err.message === "NO_ACTIVE_SESSION") {
      return res.status(404).json({ error: "No active session to resume." });
    }
    console.error("Error resuming coding session:", err);
    return res.status(500).json({ error: "Failed to resume session" });
  }
});

export default router;
