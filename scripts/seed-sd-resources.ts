import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createEmbeddingForText } from '../src/infra/aiClient';
import { SDResource } from '../src/interfaces/SDResource';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing for embeddings seeding');
}

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
console.info("AI Provider:" +AI_PROVIDER);
const TARGET_EMBED_COLUMN = AI_PROVIDER === 'gemini' ? 'embedding_gemini' : 'embedding_openai';

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

async function seedEmbeddings() {
  console.log("Starting sd_resources embeddings seeding...");

  const batch = await fetchResourcesWithoutEmbedding(10);
  if (batch.length === 0) {
    console.log("No sd_resources rows without embeddings. Nothing to do.");
    return;
  }

  for (const row of batch) {
    const baseText = `${row.title ?? ""}\n\n${row.content ?? ""}`.trim();
    if (!baseText) {
      console.log(
        `Skipping resource ${row.id} (${row.title}) – no text content for embedding`
      );
      continue;
    }

    console.log(`Embedding resource: ${row.id} (${row.title})...`);

    try {
      const embedding = await createEmbeddingForText(baseText);
      const vectorLiteral = toVectorLiteral(embedding);

      await pool.query(
        `
        UPDATE sd_resources
        SET ${TARGET_EMBED_COLUMN} = $1::vector
        WHERE id = $2
        `,
        [vectorLiteral, row.id]
      );

      console.log(`✓ Updated embedding for ${row.id}`);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      console.error(`✗ Failed embedding for ${row.id}:`, msg);

      // If quota/rate-limits, stop early so you can rerun later
      if (
        msg.includes("insufficient_quota") ||
        msg.includes("You exceeded your current quota") ||
        msg.includes("rate limit") ||
        msg.includes("429")
      ) {
        console.error(
          "Looks like quota or rate limit issue. Stopping seeding early so you can rerun later."
        );
        break;
      }

      // For other errors, just continue to next row
      continue;
    }
  }

  console.log("sd_resources embedding seeding run complete.");
}

async function fetchResourcesWithoutEmbedding(limit = 5): Promise<SDResource[]> {
  const res = await pool.query(
    `
    SELECT id, topic, title, content
    FROM sd_resources
    WHERE ${TARGET_EMBED_COLUMN} IS NULL
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows;
}

// Helper: convert embedding array to pgvector literal
function toVectorLiteral(embedding: number[]): string {
  // pgvector accepts '[x,y,z]' style
  return `[${embedding.join(",")}]`;
}

seedEmbeddings()
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
