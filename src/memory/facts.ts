import {
  checkShape,
  type Predicate,
  parsePredicate,
  predicatesClosedBy,
} from "../policy/predicates";
import { FACT_ORIGINS, type FactOrigin, initialStatus } from "../policy/trust";
import { appendAudit } from "./audit";
import { upsertEntity } from "./entities";
import { MemoryError } from "./errors";
import { parseKey } from "./keys";
import { consumeWrite } from "./limits";
import {
  type AssertFactInput,
  type AssertFactResult,
  principalId,
  type WriteContext,
} from "./types";
import { normalizeReason, normalizeTimestamp } from "./validate";

export type FactKeyRow = { id: string; subject_id: string; predicate: string; object_id: string };

/** Closes current trusted facts that a newly trusted fact replaces. Never edits valid_to. */
export function applySupersession(
  sql: SqlStorage,
  fact: FactKeyRow,
  now: string,
  auditSeq: number,
): string[] {
  const closes = predicatesClosedBy(fact.predicate as Predicate);
  const marks = closes.map(() => "?").join(", ");
  const ids = sql
    .exec<{ id: string }>(
      `SELECT id FROM facts
       WHERE subject_id = ? AND object_id = ? AND status = 'trusted' AND id <> ? AND predicate IN (${marks})`,
      fact.subject_id,
      fact.object_id,
      fact.id,
      ...closes,
    )
    .toArray()
    .map((row) => row.id);
  for (const id of ids) {
    sql.exec(
      "UPDATE facts SET status = 'superseded', superseded_by = ?, superseded_at = ?, superseded_audit_seq = ? WHERE id = ?",
      fact.id,
      now,
      auditSeq,
      id,
    );
  }
  return ids;
}

export function markTrusted(
  sql: SqlStorage,
  fact: FactKeyRow,
  by: string,
  now: string,
  auditSeq: number,
): string[] {
  sql.exec(
    "UPDATE facts SET status = 'trusted', confirmed_by = ?, confirmed_at = ?, decision_audit_seq = ? WHERE id = ?",
    by,
    now,
    auditSeq,
    fact.id,
  );
  return applySupersession(sql, fact, now, auditSeq);
}

function resolveModel(origin: FactOrigin, suggestedByModel: string | null): string | null {
  if (!(FACT_ORIGINS as readonly string[]).includes(origin)) {
    throw new MemoryError("invalid_input", `unknown origin "${origin}"`);
  }
  const model = suggestedByModel?.trim() || null;
  if (origin === "ai_suggestion" && model === null) {
    throw new MemoryError("invalid_input", "AI suggestions must name the model that produced them");
  }
  if (origin !== "ai_suggestion" && model !== null) {
    throw new MemoryError("invalid_input", "suggestedByModel is only allowed for AI suggestions");
  }
  return model;
}

export function assertFact(
  sql: SqlStorage,
  ctx: WriteContext,
  input: AssertFactInput,
  origin: FactOrigin,
  suggestedByModel: string | null = null,
): AssertFactResult {
  const model = resolveModel(origin, suggestedByModel);
  const subject = parseKey(input.subject);
  const object = parseKey(input.object);
  const predicate = parsePredicate(input.predicate);
  const validFrom =
    input.validFrom === undefined ? ctx.now : normalizeTimestamp(input.validFrom, "validFrom");
  const validTo = input.validTo === undefined ? null : normalizeTimestamp(input.validTo, "validTo");
  if (validTo !== null && validTo <= validFrom) {
    throw new MemoryError("invalid_input", "validTo must be later than validFrom");
  }
  const reason = normalizeReason(input.reason);
  checkShape(predicate, subject.kind, object.kind, { validTo, reason });
  consumeWrite(sql, principalId(ctx.principal), ctx.nowMs, ctx.writesPerMinute);

  const evidence = sql
    .exec<{ id: string }>(
      "SELECT id FROM episodes WHERE id = ? AND part_of IS NULL",
      String(input.evidenceEpisodeId ?? ""),
    )
    .toArray()[0];
  if (!evidence) {
    throw new MemoryError(
      "not_found",
      `evidence episode "${input.evidenceEpisodeId}" does not exist`,
    );
  }

  const subjectId = upsertEntity(sql, subject, ctx.now, ctx.newId);
  const objectId = upsertEntity(sql, object, ctx.now, ctx.newId);
  const status = initialStatus(origin);
  const trustedBy = `allowlist:${ctx.principal.email}`;

  const existing = sql
    .exec<{ id: string; status: string }>(
      `SELECT id, status FROM facts
       WHERE subject_id = ? AND predicate = ? AND object_id = ?
         AND status IN ('proposed', 'trusted') AND valid_to IS ?
       ORDER BY CASE status WHEN 'trusted' THEN 0 ELSE 1 END
       LIMIT 1`,
      subjectId,
      predicate,
      objectId,
      validTo,
    )
    .toArray()[0];

  if (existing) {
    const promote = existing.status === "proposed" && status === "trusted";
    sql.exec(
      "INSERT OR IGNORE INTO fact_evidence (fact_id, episode_id, added_at) VALUES (?, ?, ?)",
      existing.id,
      evidence.id,
      ctx.now,
    );
    sql.exec("UPDATE facts SET last_seen_at = ? WHERE id = ?", ctx.now, existing.id);
    const auditSeq = appendAudit(sql, ctx.now, {
      actor: ctx.principal.email,
      action: "fact.corroborate",
      target: existing.id,
      detail: {
        episodeId: evidence.id,
        origin,
        promoted: promote,
        client: ctx.principal.oauthClientName,
      },
    });
    const key = { id: existing.id, subject_id: subjectId, predicate, object_id: objectId };
    const superseded = promote ? markTrusted(sql, key, trustedBy, ctx.now, auditSeq) : [];
    return {
      factId: existing.id,
      status: promote || existing.status === "trusted" ? "trusted" : "proposed",
      corroborated: true,
      superseded,
      auditSeq,
    };
  }

  const factId = ctx.newId();
  sql.exec(
    `INSERT INTO facts (id, subject_id, predicate, object_id, attributes, evidence_episode_id, status,
      origin, proposed_by, suggested_by_model, valid_from, valid_to, recorded_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?)`,
    factId,
    subjectId,
    predicate,
    objectId,
    JSON.stringify(reason === null ? {} : { reason }),
    evidence.id,
    origin,
    ctx.principal.email,
    model,
    validFrom,
    validTo,
    ctx.now,
    ctx.now,
  );
  sql.exec(
    "INSERT INTO fact_evidence (fact_id, episode_id, added_at) VALUES (?, ?, ?)",
    factId,
    evidence.id,
    ctx.now,
  );
  sql.exec(
    "INSERT INTO fts (kind, ref_id, text) VALUES ('fact', ?, ?)",
    factId,
    [predicate, subject.key, object.key, reason ?? ""].join(" ").trim(),
  );
  const auditSeq = appendAudit(sql, ctx.now, {
    actor: ctx.principal.email,
    action: "fact.assert",
    target: factId,
    detail: {
      predicate,
      subject: subject.key,
      object: object.key,
      origin,
      status,
      client: ctx.principal.oauthClientName,
    },
  });
  const key = { id: factId, subject_id: subjectId, predicate, object_id: objectId };
  const superseded =
    status === "trusted" ? markTrusted(sql, key, trustedBy, ctx.now, auditSeq) : [];
  return { factId, status, corroborated: false, superseded, auditSeq };
}
