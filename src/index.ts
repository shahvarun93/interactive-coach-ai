// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import healthRouter from './routes/health';
import usersRouter from './routes/users'; // we'll create this file in a bit
import systemDesignRouter from './routes/system-design';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
const API_PREFIX = '/api/v1';
app.use(`${API_PREFIX}/health`, healthRouter);
app.use(`${API_PREFIX}/users`, usersRouter);
app.use(`${API_PREFIX}/system-design`, systemDesignRouter);

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});