import { findUserById } from "../dao/users.dao";
import { withRetryAndTimeout } from "../utils/retry";
import { User } from "../interfaces/User";

export async function getUserById(userId: string): Promise<User | null> {
  return withRetryAndTimeout(
    async (_signal) => {
      return await findUserById(userId);
    },
    {
      onRetry: (err, attempt) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[userService] retry attempt=${attempt} message=${message}`);
      },
    }
  );
}
