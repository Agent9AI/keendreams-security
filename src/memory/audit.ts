import { createHash } from "node:crypto";

/** Audit table and append-only triggers, shared by every database that keeps an audit log. */
export const AUDIT_SCHEMA: readonly string[] = [
  `CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL
  )`,
  "CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
  "CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
];

export const GENESIS_HASH = "0".repeat(64);

export type AuditEntry = {
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
};

export type AuditRow = {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  prev_hash: string;
  row_hash: string;
};

export type ChainCheck = { ok: true; rows: number } | { ok: false; firstBadSeq: number };

/** Synchronous on purpose: it runs inside Durable Object transactions. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function rowHash(seq: number, at: string, entry: AuditEntry, prevHash: string): string {
  return sha256Hex(
    JSON.stringify([seq, at, entry.actor, entry.action, entry.target, entry.detail, prevHash]),
  );
}

export function appendAudit(sql: SqlStorage, at: string, entry: AuditEntry): number {
  const last = sql
    .exec<{ seq: number; row_hash: string }>(
      "SELECT seq, row_hash FROM audit_log ORDER BY seq DESC LIMIT 1",
    )
    .toArray()[0];
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.row_hash ?? GENESIS_HASH;
  sql.exec(
    "INSERT INTO audit_log (seq, at, actor, action, target, detail, prev_hash, row_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    seq,
    at,
    entry.actor,
    entry.action,
    entry.target,
    JSON.stringify(entry.detail),
    prevHash,
    rowHash(seq, at, entry, prevHash),
  );
  return seq;
}

export function verifyAuditChain(sql: SqlStorage): ChainCheck {
  let prevHash = GENESIS_HASH;
  let rows = 0;
  for (const row of sql.exec<AuditRow>("SELECT * FROM audit_log ORDER BY seq ASC")) {
    const entry: AuditEntry = {
      actor: row.actor,
      action: row.action,
      target: row.target,
      detail: JSON.parse(row.detail) as Record<string, unknown>,
    };
    if (row.prev_hash !== prevHash || row.row_hash !== rowHash(row.seq, row.at, entry, prevHash)) {
      return { ok: false, firstBadSeq: row.seq };
    }
    prevHash = row.row_hash;
    rows += 1;
  }
  return { ok: true, rows };
}
