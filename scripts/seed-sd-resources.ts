import dotenv from 'dotenv';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY missing for embeddings seeding');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing for embeddings seeding');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type SeedResource = {
  title: string;
  topic: string;
  url: string;
  content: string;
};

const RESOURCES: SeedResource[] = [
  {
    title: 'Caching Strategy Cheat Sheet',
    topic: 'caching',
    url: 'https://example.com/caching-cheatsheet',
    content:
      'Compares write-through, write-back, and write-around caches. Covers cache eviction, TTLs, hot key mitigation and cache stampede protection strategies.',
  },
  {
    title: 'Designing a Global Feed',
    topic: 'feeds',
    url: 'https://example.com/global-feed',
    content:
      'Breaks down fan-out on write vs fan-out on read, storage modeling, ranking signals, and timeline consistency tips for social feeds at >100M MAU.',
  },
  {
    title: 'Messaging Queue Trade-offs',
    topic: 'messaging',
    url: 'https://example.com/mq-tradeoffs',
    content:
      'Compares Kafka, SQS, and RabbitMQ for durability, ordering, consumer scaling. Includes idempotency techniques and poison queue handling.',
  },
  {
    title: 'Rate Limiting Cookbook',
    topic: 'rate-limiting',
    url: 'https://example.com/rate-limit',
    content:
      'Token bucket vs leaky bucket vs fixed window counters, distributed coordination with Redis + Lua, and ways to return graceful backpressure signals.',
  },
  {
    title: 'Search Ranking Primer',
    topic: 'search',
    url: 'https://example.com/search-ranking',
    content:
      'Explains inverted indexes, tiered retrieval, scoring functions, and freshness tuning for product or document search at scale.',
  },
  {
    title: 'Payments Consistency Notes',
    topic: 'payments',
    url: 'https://example.com/payments-consistency',
    content:
      'Ledger modeling, double-entry accounting, reconciliation workflows, and how to guarantee idempotent charge retries without double billing.',
  },
  {
    title: 'Observability for SD Interviews',
    topic: 'observability',
    url: 'https://example.com/observability',
    content:
      'Logging vs tracing vs metrics, RED/USE methodologies, and on-call readiness talking points tailored to system design interviews.',
  },
];

async function embed(text: string): Promise<number[]> {
  const result = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return result.data[0].embedding;
}

async function seed() {
  for (const resource of RESOURCES) {
    const embedding = await embed(`${resource.title}\n${resource.content}`);
    await pool.query(
      `
      INSERT INTO sd_resources (title, url, topic, content, embedding)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (title) DO UPDATE
        SET url = EXCLUDED.url,
            topic = EXCLUDED.topic,
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            created_at = NOW()
      `,
      [resource.title, resource.url, resource.topic, resource.content, embedding]
    );
    console.log(`Seeded resource: ${resource.title}`);
  }
}

seed()
  .then(() => {
    console.log('sd_resources seeding complete');
  })
  .catch((err) => {
    console.error('Failed to seed sd_resources', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

