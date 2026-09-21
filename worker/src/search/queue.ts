export const MAX_ATTEMPTS = 5;

/**
 * Created in migration V2. `next_at` is when the item may be tried again.
 * The partial index repeats the attempt cap as a literal because SQLite
 * requires a constant there; it must stay in step with MAX_ATTEMPTS.
 */
export const QUEUE_SCHEMA: readonly string[] = [
  `CREATE TABLE vector_queue (
    item_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_at TEXT NOT NULL,
    last_error TEXT
  )`,
  "CREATE INDEX vector_queue_due ON vector_queue (next_at) WHERE attempts < 5",
];

export type QueueOp = "upsert" | "delete";

export type QueueItem = {
  itemId: string;
  kind: string;
  refId: string;
  op: QueueOp;
  attempts: number;
};

type QueueRow = { item_id: string; kind: string; ref_id: string; op: string; attempts: number };

function toItem(row: QueueRow): QueueItem {
  return {
    itemId: row.item_id,
    kind: row.kind,
    refId: row.ref_id,
    op: row.op as QueueOp,
    attempts: row.attempts,
  };
}

/** Ten seconds, doubling per attempt, capped at ten minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(10_000 * 2 ** Math.max(0, attempts), 600_000);
}

/**
 * Queues one item for indexing. Re-queuing an item that is already waiting
 * resets its schedule, so a fresh write is never stuck behind an old failure.
 */
export function enqueue(
  sql: SqlStorage,
  now: string,
  kind: string,
  refId: string,
  op: QueueOp = "upsert",
): void {
  sql.exec(
    `INSERT INTO vector_queue (item_id, kind, ref_id, op, attempts, next_at, last_error)
     VALUES (?, ?, ?, ?, 0, ?, NULL)
     ON CONFLICT (item_id) DO UPDATE SET op = excluded.op, attempts = 0, next_at = excluded.next_at, last_error = NULL`,
    `${kind}:${refId}`,
    kind,
    refId,
    op,
    now,
  );
}

export function dueItems(sql: SqlStorage, now: string, limit: number): QueueItem[] {
  return sql
    .exec<QueueRow>(
      `SELECT item_id, kind, ref_id, op, attempts FROM vector_queue
       WHERE attempts < ? AND next_at <= ? ORDER BY next_at, item_id LIMIT ?`,
      MAX_ATTEMPTS,
      now,
      limit,
    )
    .toArray()
    .map(toItem);
}

export function markDone(sql: SqlStorage, itemId: string): void {
  sql.exec("DELETE FROM vector_queue WHERE item_id = ?", itemId);
}

/** Records the failure and schedules the retry. The message is kept for /admin. */
export function markFailed(sql: SqlStorage, item: QueueItem, now: string, error: unknown): void {
  const attempts = item.attempts + 1;
  const nextAt = new Date(Date.parse(now) + backoffMs(item.attempts)).toISOString();
  const message = error instanceof Error ? error.message : String(error);
  sql.exec(
    "UPDATE vector_queue SET attempts = ?, next_at = ?, last_error = ? WHERE item_id = ?",
    attempts,
    nextAt,
    message.slice(0, 500),
    item.itemId,
  );
}

/** Items that gave up. Plan 4 shows these in /admin with a reindex action. */
export function failedItems(sql: SqlStorage): QueueItem[] {
  return sql
    .exec<QueueRow>(
      "SELECT item_id, kind, ref_id, op, attempts FROM vector_queue WHERE attempts >= ? ORDER BY item_id",
      MAX_ATTEMPTS,
    )
    .toArray()
    .map(toItem);
}

export function pendingCount(sql: SqlStorage): number {
  return sql
    .exec<{ n: number }>("SELECT COUNT(*) AS n FROM vector_queue WHERE attempts < ?", MAX_ATTEMPTS)
    .one().n;
}
