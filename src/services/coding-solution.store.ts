import { cacheGet, cacheSet } from "../infra/redis";

const memory = new Map<string, { solution: string; ts: number }>();
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function now() {
  return Date.now();
}

function isExpired(ts: number) {
  return now() - ts > TTL_MS;
}

export async function saveCodingSolution(sessionId: string, solution: string) {
  if (!solution) return;
  memory.set(sessionId, { solution, ts: now() });
  await cacheSet(`coding:solution:${sessionId}`, solution, 60 * 60 * 12);
}

export async function getCodingSolution(sessionId: string): Promise<string | null> {
  const cached = await cacheGet<string>(`coding:solution:${sessionId}`);
  if (cached) return cached;

  const entry = memory.get(sessionId);
  if (!entry) return null;
  if (isExpired(entry.ts)) {
    memory.delete(sessionId);
    return null;
  }
  return entry.solution;
}
