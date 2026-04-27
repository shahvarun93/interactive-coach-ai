import { query } from "../db";

export async function insertKeepAliveRowDb(createdAtIso: string): Promise<void> {
  await query(
    `
    INSERT INTO keep_alive (created_at)
    VALUES ($1)
    `,
    [createdAtIso]
  );
}
