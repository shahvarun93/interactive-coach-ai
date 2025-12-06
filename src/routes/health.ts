// src/routes/health.ts
import { Router } from 'express';
import { dbHealthCheck } from '../db';

const router = Router();

router.get('/live', async (_req, res) => {
  try {
    const dbNow = await dbHealthCheck();
    res.json({
      status: 'ok',
      dbTime: dbNow,
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({
      status: 'error',
      error: 'DB check failed',
    });
  }
});

router.get('/ready', (_req, res) => {
  res.status(200).send('ready');
});

export default router;