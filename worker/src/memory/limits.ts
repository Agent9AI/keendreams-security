import { MemoryError } from "./errors";

export const DEFAULT_WRITES_PER_MINUTE = 120;

/**
 * Counts one write for a principal in the current one-minute window.
 * Runs inside the write transaction, so a write that later fails is not counted.
 */
export function consumeWrite(
  sql: SqlStorage,
  principal: string,
  nowMs: number,
  limit: number,
): void {
  const windowStart = new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();
  const row = sql
    .exec<{ window_start: string; count: number }>(
      "SELECT window_start, count FROM write_counters WHERE principal = ?",
      principal,
    )
    .toArray()[0];
  if (!row || row.window_start !== windowStart) {
    sql.exec(
      "INSERT INTO write_counters (principal, window_start, count) VALUES (?, ?, 1) ON CONFLICT (principal) DO UPDATE SET window_start = excluded.window_start, count = 1",
      principal,
      windowStart,
    );
    return;
  }
  if (row.count >= limit) {
    throw new MemoryError("rate_limited", `write limit of ${limit} per minute reached`);
  }
  sql.exec("UPDATE write_counters SET count = count + 1 WHERE principal = ?", principal);
}
