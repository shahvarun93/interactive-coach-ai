// src/routes/health.ts
import { Router } from 'express';
import { dbHealthCheck } from '../db';

const router = Router();

router.get('/health', async (_req, res) => {
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

export default router;