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
app.use(healthRouter);
app.use('/users', usersRouter); // base path for user routes
app.use('/system-design', systemDesignRouter);

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});