import { parsePredicate } from "../policy/predicates";
import { MemoryError } from "./errors";
import {
  CURRENT_AT,
  currentAtBindings,
  FACT_COLUMNS,
  FACT_FROM,
  type FactJoinRow,
  type FactView,
  toFactView,
} from "./factView";
import { parseKey } from "./keys";
import { FACT_STATUSES, type FactStatus } from "./types";
import { clampLimit, normalizeTimestamp } from "./validate";

export type FindFactsQuery = {
  subject?: string;
  predicate?: string;
  object?: string;
  status?: "current" | FactStatus;
  asOf?: string;
  limit?: number;
};

export function findFacts(sql: SqlStorage, query: FindFactsQuery, now: string): FactView[] {
  const where: string[] = [];
  const bindings: SqlStorageValue[] = [];
  if (query.subject !== undefined) {
    where.push("s.canonical_key = ?");
    bindings.push(parseKey(query.subject).key);
  }
  if (query.predicate !== undefined) {
    where.push("f.predicate = ?");
    bindings.push(parsePredicate(query.predicate));
  }
  if (query.object !== undefined) {
    where.push("o.canonical_key = ?");
    bindings.push(parseKey(query.object).key);
  }
  const status = query.status ?? "current";
  if (status === "current") {
    const t = query.asOf === undefined ? now : normalizeTimestamp(query.asOf, "asOf");
    where.push(CURRENT_AT);
    bindings.push(...currentAtBindings(t));
  } else {
    if (!(FACT_STATUSES as readonly string[]).includes(status)) {
      throw new MemoryError("invalid_input", `unknown status "${status}"`);
    }
    if (query.asOf !== undefined) {
      throw new MemoryError("invalid_input", "asOf only applies to current facts");
    }
    where.push("f.status = ?");
    bindings.push(status);
  }
  bindings.push(clampLimit(query.limit, 50, 200));
  return sql
    .exec<FactJoinRow>(
      `SELECT ${FACT_COLUMNS} ${FACT_FROM} WHERE ${where.join(" AND ")} ORDER BY f.recorded_at DESC, f.id LIMIT ?`,
      ...bindings,
    )
    .toArray()
    .map(toFactView);
}

type EntityRow = { id: string; kind: string; display_name: string; created_at: string };

function loadEntity(sql: SqlStorage, rawKey: string): EntityRow & { key: string } {
  const key = parseKey(rawKey);
  const row = sql
    .exec<EntityRow>(
      "SELECT id, kind, display_name, created_at FROM entities WHERE canonical_key = ?",
      key.key,
    )
    .toArray()[0];
  if (!row) {
    throw new MemoryError("not_found", `no entity "${key.key}"`);
  }
  return { ...row, key: key.key };
}

export type EntityView = {
  key: string;
  kind: string;
  displayName: string;
  createdAt: string;
  facts: FactView[];
  neighbors: string[];
  pendingProposals: number;
};

export function getEntity(sql: SqlStorage, rawKey: string, now: string): EntityView {
  const entity = loadEntity(sql, rawKey);
  const facts = sql
    .exec<FactJoinRow>(
      `SELECT ${FACT_COLUMNS} ${FACT_FROM}
       WHERE (f.subject_id = ? OR f.object_id = ?) AND ${CURRENT_AT}
       ORDER BY f.recorded_at DESC, f.id LIMIT 100`,
      entity.id,
      entity.id,
      ...currentAtBindings(now),
    )
    .toArray()
    .map(toFactView);
  const neighbors = [
    ...new Set(facts.map((fact) => (fact.subject === entity.key ? fact.object : fact.subject))),
  ].sort();
  const pendingProposals = sql
    .exec<{ n: number }>(
      "SELECT COUNT(*) AS n FROM facts WHERE (subject_id = ? OR object_id = ?) AND status = 'proposed'",
      entity.id,
      entity.id,
    )
    .one().n;
  return {
    key: entity.key,
    kind: entity.kind,
    displayName: entity.display_name,
    createdAt: entity.created_at,
    facts,
    neighbors,
    pendingProposals,
  };
}

export type GraphQuery = { key: string; depth?: number; predicates?: string[] };
export type GraphView = { root: string; depth: number; edges: FactView[]; truncated: boolean };

export const MAX_GRAPH_EDGES = 200;

export function exploreGraph(sql: SqlStorage, query: GraphQuery, now: string): GraphView {
  const depth = query.depth ?? 1;
  if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
    throw new MemoryError("invalid_input", "depth must be 1, 2 or 3");
  }
  const predicates = (query.predicates ?? []).map(parsePredicate);
  const root = loadEntity(sql, query.key);
  const predicateFilter = predicates.length
    ? ` AND predicate IN (${predicates.map(() => "?").join(", ")})`
    : "";
  const rows = sql
    .exec<FactJoinRow>(
      `WITH RECURSIVE
         cur AS (
           SELECT id, subject_id, object_id FROM facts
           WHERE status = 'trusted' AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)${predicateFilter}
         ),
         walk(entity_id, depth) AS (
           SELECT ?, 0
           UNION
           SELECT CASE WHEN c.subject_id = w.entity_id THEN c.object_id ELSE c.subject_id END, w.depth + 1
           FROM walk w JOIN cur c ON c.subject_id = w.entity_id OR c.object_id = w.entity_id
           WHERE w.depth < ?
         ),
         reached AS (SELECT DISTINCT entity_id FROM walk WHERE depth < ?)
       SELECT ${FACT_COLUMNS} ${FACT_FROM}
       WHERE f.id IN (
         SELECT id FROM cur
         WHERE subject_id IN (SELECT entity_id FROM reached) OR object_id IN (SELECT entity_id FROM reached)
       )
       ORDER BY f.recorded_at DESC, f.id
       LIMIT ?`,
      now,
      now,
      ...predicates,
      root.id,
      depth,
      depth,
      MAX_GRAPH_EDGES + 1,
    )
    .toArray();
  return {
    root: root.key,
    depth,
    edges: rows.slice(0, MAX_GRAPH_EDGES).map(toFactView),
    truncated: rows.length > MAX_GRAPH_EDGES,
  };
}

export type HistoryQuery = {
  factId?: string;
  subject?: string;
  predicate?: string;
  object?: string;
};

export type AuditView = {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  /** Raw JSON text of the audit detail; RPC results must be serializable. */
  detail: string;
};

export type HistoryView = { facts: FactView[]; audit: AuditView[] };

/** At most 90 versions, keeping the audit lookup under the 100 bound-parameter limit. */
export function factHistory(sql: SqlStorage, query: HistoryQuery): HistoryView {
  let where: string;
  let bindings: SqlStorageValue[];
  if (query.factId !== undefined) {
    const row = sql
      .exec<{ subject_id: string; predicate: string; object_id: string }>(
        "SELECT subject_id, predicate, object_id FROM facts WHERE id = ?",
        query.factId,
      )
      .toArray()[0];
    if (!row) {
      throw new MemoryError("not_found", `fact "${query.factId}" does not exist`);
    }
    where = "f.subject_id = ? AND f.predicate = ? AND f.object_id = ?";
    bindings = [row.subject_id, row.predicate, row.object_id];
  } else if (query.subject && query.predicate && query.object) {
    where = "s.canonical_key = ? AND f.predicate = ? AND o.canonical_key = ?";
    bindings = [
      parseKey(query.subject).key,
      parsePredicate(query.predicate),
      parseKey(query.object).key,
    ];
  } else {
    throw new MemoryError("invalid_input", "provide factId, or subject, predicate and object");
  }
  const facts = sql
    .exec<FactJoinRow>(
      `SELECT ${FACT_COLUMNS} ${FACT_FROM} WHERE ${where} ORDER BY f.recorded_at ASC, f.id LIMIT 90`,
      ...bindings,
    )
    .toArray()
    .map(toFactView);
  if (facts.length === 0) return { facts, audit: [] };
  const ids = facts.map((fact) => fact.id);
  const audit = sql
    .exec<{
      seq: number;
      at: string;
      actor: string;
      action: string;
      target: string;
      detail: string;
    }>(
      `SELECT seq, at, actor, action, target, detail FROM audit_log
       WHERE target IN (${ids.map(() => "?").join(", ")}) ORDER BY seq ASC`,
      ...ids,
    )
    .toArray();
  return { facts, audit };
}

export type ProposalView = FactView & {
  evidence: { episodeId: string; source: string; quote: string; flags: string[] };
};

export const EVIDENCE_QUOTE_CHARS = 500;

export function listProposals(sql: SqlStorage, limit?: number): ProposalView[] {
  const rows = sql
    .exec<FactJoinRow & { ev_id: string; ev_source: string; ev_quote: string; ev_flags: string }>(
      `SELECT ${FACT_COLUMNS}, e.id AS ev_id, e.source AS ev_source,
         substr(e.content, 1, ${EVIDENCE_QUOTE_CHARS}) AS ev_quote, e.flags AS ev_flags
       ${FACT_FROM} JOIN episodes e ON e.id = f.evidence_episode_id
       WHERE f.status = 'proposed'
       ORDER BY f.recorded_at ASC, f.id
       LIMIT ?`,
      clampLimit(limit, 50, 200),
    )
    .toArray();
  return rows.map((row) => ({
    ...toFactView(row),
    evidence: {
      episodeId: row.ev_id,
      source: row.ev_source,
      quote: row.ev_quote,
      flags: JSON.parse(row.ev_flags) as string[],
    },
  }));
}
