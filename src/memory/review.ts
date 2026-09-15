import { appendAudit } from "./audit";
import { MemoryError } from "./errors";
import { type FactKeyRow, markTrusted } from "./facts";
import type { ReviewContext, ReviewResult, RollbackResult } from "./types";
import { normalizeReason } from "./validate";

type ReviewRow = FactKeyRow & { status: string };

function requireReviewer(ctx: ReviewContext): void {
  if (typeof ctx.reviewerEmail !== "string" || ctx.reviewerEmail.trim() === "") {
    throw new MemoryError("invalid_input", "a reviewer identity is required");
  }
}

function loadProposed(sql: SqlStorage, factId: string): ReviewRow {
  const fact = sql
    .exec<ReviewRow>(
      "SELECT id, subject_id, predicate, object_id, status FROM facts WHERE id = ?",
      String(factId ?? ""),
    )
    .toArray()[0];
  if (!fact) {
    throw new MemoryError("not_found", `fact "${factId}" does not exist`);
  }
  if (fact.status !== "proposed") {
    throw new MemoryError("invalid_input", `fact "${factId}" is ${fact.status}, not proposed`);
  }
  return fact;
}

export function confirmFact(sql: SqlStorage, ctx: ReviewContext, factId: string): ReviewResult {
  requireReviewer(ctx);
  const fact = loadProposed(sql, factId);
  const auditSeq = appendAudit(sql, ctx.now, {
    actor: ctx.reviewerEmail,
    action: "fact.confirm",
    target: fact.id,
    detail: {},
  });
  const superseded = markTrusted(sql, fact, ctx.reviewerEmail, ctx.now, auditSeq);
  return { factId: fact.id, status: "trusted", superseded, auditSeq };
}

export function rejectFact(
  sql: SqlStorage,
  ctx: ReviewContext,
  factId: string,
  reason?: string,
): ReviewResult {
  requireReviewer(ctx);
  const fact = loadProposed(sql, factId);
  const why = normalizeReason(reason);
  const auditSeq = appendAudit(sql, ctx.now, {
    actor: ctx.reviewerEmail,
    action: "fact.reject",
    target: fact.id,
    detail: why === null ? {} : { reason: why },
  });
  sql.exec(
    "UPDATE facts SET status = 'rejected', rejected_by = ?, rejected_at = ?, decision_audit_seq = ? WHERE id = ?",
    ctx.reviewerEmail,
    ctx.now,
    auditSeq,
    fact.id,
  );
  return { factId: fact.id, status: "rejected", superseded: [], auditSeq };
}

/**
 * Undo every trust decision recorded after `toSeq`: facts confirmed, rejected or
 * auto-trusted later go back to proposed, and facts those decisions superseded reopen.
 */
export function rollbackTo(sql: SqlStorage, ctx: ReviewContext, toSeq: number): RollbackResult {
  requireReviewer(ctx);
  const maxSeq =
    sql.exec<{ max_seq: number | null }>("SELECT MAX(seq) AS max_seq FROM audit_log").one()
      .max_seq ?? 0;
  if (!Number.isInteger(toSeq) || toSeq < 0 || toSeq > maxSeq) {
    throw new MemoryError("invalid_input", `rollback target must be between 0 and ${maxSeq}`);
  }

  const ids = (query: string, ...params: number[]) =>
    sql
      .exec<{ id: string }>(query, ...params)
      .toArray()
      .map((row) => row.id);

  const reopened = ids(
    "SELECT id FROM facts WHERE superseded_audit_seq > ? AND decision_audit_seq <= ? ORDER BY id",
    toSeq,
    toSeq,
  );
  const reverted = ids("SELECT id FROM facts WHERE decision_audit_seq > ? ORDER BY id", toSeq);

  sql.exec(
    `UPDATE facts SET status = 'trusted', superseded_by = NULL, superseded_at = NULL, superseded_audit_seq = NULL
     WHERE superseded_audit_seq > ? AND decision_audit_seq <= ?`,
    toSeq,
    toSeq,
  );
  sql.exec(
    `UPDATE facts SET status = 'proposed', confirmed_by = NULL, confirmed_at = NULL,
       rejected_by = NULL, rejected_at = NULL, decision_audit_seq = NULL,
       superseded_by = NULL, superseded_at = NULL, superseded_audit_seq = NULL
     WHERE decision_audit_seq > ?`,
    toSeq,
  );

  const auditSeq = appendAudit(sql, ctx.now, {
    actor: ctx.reviewerEmail,
    action: "audit.rollback",
    target: `seq:${toSeq}`,
    detail: { reopened, reverted },
  });
  return { toSeq, reopened, reverted, auditSeq };
}
