import { insertKeepAliveRowDb } from "../dao/keepAlive.dao";
import { withRetryAndTimeout } from "../utils/retry";

const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const parsedIntervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS);
const KEEP_ALIVE_INTERVAL_MS =
  Number.isFinite(parsedIntervalMs) && parsedIntervalMs > 0
    ? parsedIntervalMs
    : DEFAULT_KEEP_ALIVE_INTERVAL_MS;

let keepAliveTimer: NodeJS.Timeout | null = null;

export async function insertKeepAliveRow(): Promise<void> {
  await withRetryAndTimeout(
    async (_signal) => {
      await insertKeepAliveRowDb(new Date().toISOString());
    },
    {
      onRetry: (err, attempt) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[keepAliveService] retry attempt=${attempt} message=${message}`);
      },
    }
  );
}

export function startKeepAliveService(): void {
  if (keepAliveTimer) {
    return;
  }

  void insertKeepAliveRow().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[keepAliveService] initial run failed message=${message}`);
  });

  keepAliveTimer = setInterval(() => {
    void insertKeepAliveRow().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[keepAliveService] scheduled run failed message=${message}`);
    });
  }, KEEP_ALIVE_INTERVAL_MS);
}

startKeepAliveService();
