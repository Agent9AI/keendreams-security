import type { FactStatus } from "./types";

export const FACT_COLUMNS = `f.id, s.canonical_key AS subject_key, f.predicate, o.canonical_key AS object_key,
  f.attributes, f.status, f.origin, f.proposed_by, f.suggested_by_model, f.valid_from, f.valid_to,
  f.recorded_at, f.last_seen_at, f.confirmed_by, f.confirmed_at, f.superseded_by, f.superseded_at,
  (SELECT group_concat(fe.episode_id) FROM fact_evidence fe WHERE fe.fact_id = f.id) AS evidence_ids`;

export const FACT_FROM =
  "FROM facts f JOIN entities s ON s.id = f.subject_id JOIN entities o ON o.id = f.object_id";

/**
 * Trusted as of `t`: confirmed by then, valid in the world at `t`, and not yet
 * superseded at `t`. Needs four bindings, all `t` (see currentAtBindings).
 * Trust undone by a rollback counts as never granted.
 */
export const CURRENT_AT = `(f.status = 'trusted' OR (f.status = 'superseded' AND f.superseded_at > ?))
  AND f.confirmed_at <= ? AND f.valid_from <= ? AND (f.valid_to IS NULL OR f.valid_to > ?)`;

export function currentAtBindings(t: string): string[] {
  return [t, t, t, t];
}

export type FactJoinRow = {
  id: string;
  subject_key: string;
  predicate: string;
  object_key: string;
  attributes: string;
  status: string;
  origin: string;
  proposed_by: string;
  suggested_by_model: string | null;
  valid_from: string;
  valid_to: string | null;
  recorded_at: string;
  last_seen_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
  evidence_ids: string | null;
};

export type FactView = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  status: FactStatus;
  origin: string;
  reason: string | null;
  proposedBy: string;
  suggestedByModel: string | null;
  validFrom: string;
  validTo: string | null;
  recordedAt: string;
  lastSeenAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  supersededBy: string | null;
  supersededAt: string | null;
  evidenceEpisodeIds: string[];
};

export function toFactView(row: FactJoinRow): FactView {
  const attributes = JSON.parse(row.attributes) as { reason?: string };
  return {
    id: row.id,
    subject: row.subject_key,
    predicate: row.predicate,
    object: row.object_key,
    status: row.status as FactStatus,
    origin: row.origin,
    reason: attributes.reason ?? null,
    proposedBy: row.proposed_by,
    suggestedByModel: row.suggested_by_model,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    recordedAt: row.recorded_at,
    lastSeenAt: row.last_seen_at,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    supersededBy: row.superseded_by,
    supersededAt: row.superseded_at,
    evidenceEpisodeIds: row.evidence_ids ? row.evidence_ids.split(",").sort() : [],
  };
}
