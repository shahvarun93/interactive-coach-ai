// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import path from "path";
import express from 'express';
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