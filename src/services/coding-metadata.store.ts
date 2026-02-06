import { cacheGet, cacheSet } from "../infra/redis";
import { CodingSignature } from "../interfaces/CodingSignature";

const memory = new Map<string, { value: CodingMetadata; ts: number }>();
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type CodingMetadata = {
  language: string | null;
  boilerplate: string;
  signature: CodingSignature;
};

function now() {
  return Date.now();
}

function isExpired(ts: number) {
  return now() - ts > TTL_MS;
}

export async function saveCodingMetadata(sessionId: string, metadata: CodingMetadata) {
  if (!metadata || !metadata.boilerplate) return;
  memory.set(sessionId, { value: metadata, ts: now() });
  await cacheSet(`coding:meta:${sessionId}`, JSON.stringify(metadata), 60 * 60 * 24 * 30);
}

export async function getCodingMetadata(sessionId: string): Promise<CodingMetadata | null> {
  const cached = await cacheGet<string>(`coding:meta:${sessionId}`);
  if (cached) {
    try {
      return JSON.parse(cached) as CodingMetadata;
    } catch {
      return null;
    }
  }

  const entry = memory.get(sessionId);
  if (!entry) return null;
  if (isExpired(entry.ts)) {
    memory.delete(sessionId);
    return null;
  }
  return entry.value;
}
