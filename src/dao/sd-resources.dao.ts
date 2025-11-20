import { query } from '../db';
import { SDResource } from '../interfaces/SDResource';

export async function upsertResource(resource: {
  title: string;
  url?: string | null;
  topic?: string | null;
  content: string;
  embedding: number[];
}): Promise<SDResource> {
  const { title, url, topic, content, embedding } = resource;

  const result = await query(
    `
    INSERT INTO sd_resources (title, url, topic, content, embedding)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (title) DO UPDATE
      SET url = EXCLUDED.url,
          topic = EXCLUDED.topic,
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          created_at = NOW()
    RETURNING id, title, url, topic, content, created_at
    `,
    [title, url ?? null, topic ?? null, content, embedding]
  );

  return result.rows[0] as SDResource;
}

export async function findResourcesByTopic(
  topic: string,
  limit = 5
): Promise<SDResource[]> {
  const result = await query(
    `
    SELECT id, title, topic, url, content, created_at
    FROM sd_resources
    WHERE topic = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [topic, limit]
  );

  return result.rows as SDResource[];
}
