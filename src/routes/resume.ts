// src/routes/users.ts
import { Router } from "express";
import multer from "multer";
import * as resumeService from "../services/resume.service";
const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB is plenty for a resume
  },
});

router.post("/analyze-text", async (req, res) => {
  try {
    const { text, targetRole, targetCompany, mode } = req.body || {};
    const email = (req.body?.email ?? "").trim();

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text' field" });
    }

    const result = await resumeService.analyzeResumeFromText({
        email,
        text,
        targetRole,
        targetCompany,
        mode
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

router.post(
  "/extract-text",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const result = await resumeService.extractResumeTextFromFile(req.file);

      return res.json({
        text: result.text,  // what resume.html expects
      });
    } catch (err: any) {
      console.error("extract-text error:", err);
      res.status(500).json({
        error:
          err?.message ||
          "Failed to extract text from resume file.",
      });
    }
  }
);

export default router;