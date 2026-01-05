// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import path from "path";
import crypto from "crypto";
import express, { Request, Response, NextFunction } from 'express';
import healthRouter from './routes/health';
import usersRouter from './routes/users'; // we'll create this file in a bit
import systemDesignRouter from './routes/system-design';
import resumeRouter from './routes/resume';
import interviewRouter from './routes/interview';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use((req, _res, next) => {
  console.log("INCOMING:", req.method, req.url);
  next();
});
// Routes
const API_PREFIX = '/api/v1';
// Put this near the top of your app setup (before routes)
// Shared secret used to prove the request came through the Cloudflare Pages proxy.
// Support optional rotation by allowing a previous key during rollout.
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

function timingSafeEquals(a: string, b: string): boolean {
  // Important: timingSafeEqual throws if lengths differ.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function matchesAnyInternalKey(provided: string): boolean {
  if (!provided) return false;
  if (INTERNAL_API_KEY && timingSafeEquals(provided, INTERNAL_API_KEY)) return true;
  return false;
}

function requireInternalApiKey(req: Request, res: Response, next: NextFunction) {
  if (req.path === `${API_PREFIX}/health`) return next();

  const key = (req.get("X-Internal-Api-Key") || "").trim();

  if (!INTERNAL_API_KEY) {
    return res
      .status(500)
      .json({ error: "Server misconfigured (missing INTERNAL_API_KEY)" });
  }

  if (!matchesAnyInternalKey(key)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

// Apply to API routes only
app.use(API_PREFIX, requireInternalApiKey);
app.use(`${API_PREFIX}/health`, healthRouter);
app.use(`${API_PREFIX}/users`, usersRouter);
app.use(`${API_PREFIX}/system-design`, systemDesignRouter);
app.use(`${API_PREFIX}/resume`, resumeRouter);
app.use(`${API_PREFIX}/interview`, interviewRouter);
app.get("/practice", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
