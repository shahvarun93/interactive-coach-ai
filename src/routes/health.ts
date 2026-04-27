// src/routes/health.ts
import { Router } from 'express';
import { dbHealthCheck } from '../db';
import { getOpenAiUsageSnapshot } from '../infra/openaiClient';

const router = Router();

router.get('/live', async (_req, res) => {
  res.status(200).send('live');
});

router.get('/ready', (_req, res) => {
  res.status(200).send('ready');
});

router.get('/dbhealth', async (_req, res) => {
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

// Lightweight metrics endpoint for OpenAI token + cost usage.
// Enterprise rationale:
// - Keeps metrics under the existing /health namespace, which SREs already scrape.
// - Exposes per-model aggregates without leaking internal implementation details.
router.get('/metrics/openai', (_req, res) => {
  const usageByModel = getOpenAiUsageSnapshot();
  res.json({
    source: 'openai_client',
    models: usageByModel,
  });
});

export default router;