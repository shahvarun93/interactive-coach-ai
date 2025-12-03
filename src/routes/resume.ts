// src/routes/users.ts
import { Router } from "express";
import * as resumeService from "../services/resume.service";
const router = Router();

router.post("/analyze-text", async (req, res) => {
  try {
    const { text, targetRole, targetCompany } = req.body || {};
    const email = (req.body?.email ?? "").trim();

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text' field" });
    }

    const result = await resumeService.analyzeResumeFromText({
        email,
        text,
        targetRole,
        targetCompany,
      });
      res.json(result);
  } catch (e: any) {
    console.error("Error in /resume/analyze-text:", e);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

router.post("/tailor", async (req, res) => {
  try {
    const { text, jobDescription, targetRole, targetCompany } = req.body || {};

    if (!text || !jobDescription) {
      return res.status(400).json({
        error: "Both 'text' (resume) and 'jobDescription' are required.",
      });
    }

    const result = await resumeService.tailorResumeFromText({
      text,
      jobDescription,
      targetRole,
      targetCompany,
    });

    return res.json(result);
  } catch (err: any) {
    console.error("Error in /resume/tailor:", err);
    return res.status(500).json({
      error:
        err?.message ||
        "Failed to tailor resume for the given job description.",
    });
  }
});

export default router;