// src/routes/system-design.ts (or sd.ts)
import { Router } from "express";
import * as systemDesignService from "../services/system-design.service";
import * as usersDao from "../dao/users.dao";
import { findUserByEmail } from "../services/users.service";

const router = Router();

// Create session by email
router.post("/by-email", async (req, res) => {
  try {
    const { email, prompt, topic } = req.body;

    if (!email || !prompt) {
      return res.status(400).json({ error: "email and prompt are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "No user found with this email" });
    }

    const session = await systemDesignService.createSystemDesignSession(
      user.id,
      prompt,
      topic ?? null
    );
    res.status(201).json(session);
  } catch (err) {
    console.error("Error creating SD session by email:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// existing routes (e.g., POST /sd, GET /sd/user/:userId) ...

/**
 * POST /sd/generate-prompt
 * Body: { email: string, difficulty?: 'easy' | 'medium' | 'hard' }
 * - Looks up user by email
 * - Generates a system design question with OpenAI
 * - Creates a session in system_design_sessions
 * - Returns { sessionId, prompt, userId, difficulty }
 */
router.post("/generate-prompt", async (req, res) => {
  try {
    const { email, difficulty, topic } = req.body as {
      email?: string;
      difficulty?: "easy" | "medium" | "hard";
      topic: string | null;
    };

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "No user found with this email" });
    }

    const { session, question } =
      await systemDesignService.createAISystemDesignSessionForUser(
        user.id,
        difficulty ?? "medium",
        topic ?? null
      );

    res.status(201).json({
      sessionId: session.id,
      userId: session.user_id,
      prompt: question,
      difficulty: difficulty ?? "medium",
      createdAt: session.created_at,
    });
  } catch (err) {
    console.error("Error generating SD prompt:", err);
    res.status(500).json({ error: "Failed to generate prompt" });
  }
});

router.post("/submit-answer", async (req, res) => {
  try {
    const { sessionId, answer } = req.body as {
      sessionId?: string;
      answer?: string;
    };

    if (!sessionId || !answer) {
      return res
        .status(400)
        .json({ error: "sessionId and answer are required" });
    }

    const result = await systemDesignService.submitSystemDesignAnswer(
      sessionId,
      answer
    );

    res.status(200).json({
      sessionId: result.session.id,
      score: result.evaluation.score,
      strengths: result.evaluation.strengths,
      weaknesses: result.evaluation.weaknesses,
      updatedAt: result.session.updated_at,
    });
  } catch (err: any) {
    console.error("Error submitting SD answer:", err);
    if (err.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.status(500).json({ error: "Failed to submit answer" });
  }
});

// src/routes/system-design.ts
router.get("/session/:id", async (req, res) => {
  // here :id = sessionId
  try {
    const session = await systemDesignService.getSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // If strengths/weaknesses are stored as JSON strings:
    let strengths: string[] = [];
    let weaknesses: string[] = [];

    try {
      strengths = session.strengths ? JSON.parse(session.strengths as any) : [];
    } catch {}
    try {
      weaknesses = session.weaknesses
        ? JSON.parse(session.weaknesses as any)
        : [];
    } catch {}

    res.json({
      id: session.id,
      userId: session.user_id,
      prompt: session.prompt,
      answer: session.answer,
      score: session.score,
      strengths,
      weaknesses,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      topic: session.topic,
    });
  } catch (err) {
    console.error("Error fetching SD session:", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.get("/user/:userId/stats", async (req, res) => {
  // here :id = userId
  try {
    const userId = req.params.userId;

    const stats = await systemDesignService.getUserSystemDesignStats(userId);
    if (!stats) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(stats);
  } catch (err) {
    console.error("Error fetching user stats:", err);
    return res.status(500).json({ error: "Failed to fetch user stats" });
  }
});

router.get("/user/:userId/sessions", async (req, res) => {
  // here :id = userId
  try {
    const userId = req.params.userId;
    const sessions = await systemDesignService.listSessionsForUser(userId);

    // If you want to be nice and return an empty array instead of 404:
    return res.json(
      sessions.map((session) => ({
        id: session.id,
        userId: session.user_id,
        prompt: session.prompt,
        answer: session.answer,
        score: session.score,
        strengths: session.strengths,
        weaknesses: session.weaknesses,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        topic: session.topic,
      }))
    );
  } catch (err) {
    console.error("Error fetching sessions for user:", err);
    return res.status(500).json({ error: "Failed to fetch sessions for user" });
  }
});

router.post("/coach", async (req, res) => {
  try {
    const { email, sessionId } = req.body as {
      email?: string;
      sessionId?: string;
    };

    if (!email || !sessionId) {
      return res.status(400).json({
        error: "email and sessionId are required",
      });
    }

    const result = await systemDesignService.createCoachFeedbackForSession(
      email,
      sessionId
    );

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Error generating coach feedback:", err);

    if (err?.message === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "User not found" });
    }
    if (err?.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ error: "Session not found" });
    }
    if (err?.message === "ANSWER_NOT_FOUND") {
      return res
        .status(400)
        .json({ error: "No answer submitted for this session yet" });
    }

    return res.status(500).json({
      error: "Failed to generate coaching feedback",
      details:
        process.env.NODE_ENV === "development"
          ? err.message ?? String(err)
          : undefined,
    });
  }
});

router.post("/next-question", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await usersDao.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found for this email." });
    }

    const { topic, difficulty, reason } =
      await systemDesignService.chooseNextTopicAndDifficultyForUser(user.id);

    const { session, question } =
      await systemDesignService.createAISystemDesignSessionForUser(
        user.id,
        difficulty,
        topic
      );

    return res.json({
      sessionId: session.id,
      topic,
      difficulty,
      question,
      selectionReason: reason,
    });
  } catch (err: any) {
    console.error("Error in /system-design/next-question:", err);
    return res.status(500).json({
      error: "Failed to generate next question.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

export default router;
