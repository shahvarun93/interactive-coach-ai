-- Create sd_resources table for lightweight RAG knowledge base
CREATE TABLE IF NOT EXISTS sd_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT,
  topic TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sd_resources_title_key ON sd_resources (title);

-- Optional IVF index for pgvector (requires `CREATE EXTENSION IF NOT EXISTS vector;` run separately)
-- CREATE INDEX IF NOT EXISTS sd_resources_embedding_idx
--   ON sd_resources
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

CREATE INDEX IF NOT EXISTS sd_resources_topic_idx ON sd_resources (topic);

