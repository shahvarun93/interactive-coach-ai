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

export default router;