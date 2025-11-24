// src/infra/redis.ts
import { Redis } from "@upstash/redis";

if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
  console.warn(
    "[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set. Redis cache will be disabled."
  );
}

export const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (redis != null) {
  console.info(
    "Redis connection success, listening at: " +
      process.env.UPSTASH_REDIS_REST_URL
  );
}
// 🔹 Central default TTL for *generic* caching (e.g. plans, stats, etc.)
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 12; // 12 hours by default

export const CACHE_DEBUG = process.env.CACHE_DEBUG === "1";

// Lightweight helpers so callers don’t have to worry about null client
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    if (CACHE_DEBUG) {
      console.log("[cache] GET", key, value ? "HIT" : "MISS");
    }
    return value ?? null;
  } catch (err) {
    console.warn("[cache] GET error:", (err as Error).message);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  if (!redis) return;
  try {
    const ex = ttlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
    await redis.set(key, value as any, { ex });
    if (CACHE_DEBUG) {
      console.log("[cache] SET", key, "ttl=", ex, "seconds");
    }
  } catch (err) {
    console.warn("[cache] SET error:", (err as Error).message);
  }
}
