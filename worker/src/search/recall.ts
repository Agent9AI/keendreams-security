import { MemoryError } from "../memory/errors";
import {
  CURRENT_AT,
  currentAtBindings,
  FACT_COLUMNS,
  FACT_FROM,
  type FactJoinRow,
  type FactView,
  toFactView,
} from "../memory/factView";
import { EVIDENCE_QUOTE_CHARS } from "../memory/queries";
import { clampLimit, normalizeTimestamp } from "../memory/validate";
import type { SearchBackend } from "./backend";
import { ftsSearch } from "./fts";
import { fuse } from "./rrf";

/**
 * Durable Object SQLite allows about 100 bound parameters per statement, so every
 * list that reaches an IN clause is capped well under that, counting the clauses
 * that bind their list twice.
 */
const CANDIDATES_PER_LEG = 50;
const MAX_FUSED = 60;
const MAX_LOOKUP = 40;
const MAX_FACT_IDS = 60;
const MAX_NEIGHBOUR_KEYS = 30;
const MAX_RELATED = 25;

export const DEFAULT_RECALL_LIMIT = 10;
export const MAX_RECALL_LIMIT = 25;

export type RecallQuery = {
  query: string;
  asOf?: string;
  includeProposed?: boolean;
  limit?: number;
};

export type RecallItem = FactView & {
  evidence: { episodeId: string; source: string; quote: string; flags: string[] };
  score: number;
};

export type RecallView = {
  searchMode: "hybrid" | "keyword_only";
  count: number;
  results: RecallItem[];
  related: FactView[];
};

type FactRow = FactJoinRow & {
  ev_id: string;
  ev_source: string;
  ev_quote: string;
  ev_flags: string;
};

const SELECT_FACTS = `SELECT ${FACT_COLUMNS}, e.id AS ev_id, e.source AS ev_source,
  substr(e.content, 1, ${EVIDENCE_QUOTE_CHARS}) AS ev_quote, e.flags AS ev_flags
  ${FACT_FROM} JOIN episodes e ON e.id = f.evidence_episode_id`;

function marks(count: number): string {
  return new Array(count).fill("?").join(", ");
}

/**
 * Turns fused item ids into the facts they point at, keeping the fused order.
 * A fact stands for itself, an episode for the facts it is evidence for, and an
 * entity for the facts it takes part in.
 */
function rankedFactIds(sql: SqlStorage, itemIds: string[]): Map<string, number> {
  const ranked = new Map<string, number>();
  const episodeIds: string[] = [];
  const entityIds: string[] = [];
  itemIds.forEach((itemId, index) => {
    const separator = itemId.indexOf(":");
    const kind = itemId.slice(0, separator);
    const refId = itemId.slice(separator + 1);
    if (kind === "fact") {
      if (!ranked.has(refId)) ranked.set(refId, index);
    } else if (kind === "episode" && episodeIds.length < MAX_LOOKUP) {
      episodeIds.push(refId);
    } else if (kind === "entity" && entityIds.length < MAX_LOOKUP) {
      entityIds.push(refId);
    }
  });

  const addIndirect = (id: string) => {
    if (!ranked.has(id) && ranked.size < MAX_FACT_IDS) {
      ranked.set(id, itemIds.length + ranked.size);
    }
  };

  if (episodeIds.length > 0) {
    for (const row of sql.exec<{ fact_id: string }>(
      `SELECT DISTINCT fact_id FROM fact_evidence WHERE episode_id IN (${marks(episodeIds.length)})`,
      ...episodeIds,
    )) {
      addIndirect(row.fact_id);
    }
  }
  if (entityIds.length > 0) {
    for (const row of sql.exec<{ id: string }>(
      `SELECT id FROM facts WHERE subject_id IN (${marks(entityIds.length)})
         OR object_id IN (${marks(entityIds.length)}) LIMIT ${MAX_FACT_IDS}`,
      ...entityIds,
      ...entityIds,
    )) {
      addIndirect(row.id);
    }
  }
  return ranked;
}

function toItem(row: FactRow, score: number): RecallItem {
  return {
    ...toFactView(row),
    evidence: {
      episodeId: row.ev_id,
      source: row.ev_source,
      quote: row.ev_quote,
      flags: JSON.parse(row.ev_flags) as string[],
    },
    score,
  };
}

/** One hop of confirmed facts around whatever the answer already names. */
function neighboursOf(sql: SqlStorage, results: RecallItem[], asOf: string): FactView[] {
  const keys = [...new Set(results.flatMap((item) => [item.subject, item.object]))].slice(
    0,
    MAX_NEIGHBOUR_KEYS,
  );
  if (keys.length === 0) return [];
  const found = new Set(results.map((item) => item.id));
  return sql
    .exec<FactJoinRow>(
      `SELECT ${FACT_COLUMNS} ${FACT_FROM}
       WHERE (s.canonical_key IN (${marks(keys.length)}) OR o.canonical_key IN (${marks(keys.length)}))
         AND ${CURRENT_AT}
       ORDER BY f.recorded_at DESC, f.id LIMIT ${MAX_RELATED}`,
      ...keys,
      ...keys,
      ...currentAtBindings(asOf),
    )
    .toArray()
    .map(toFactView)
    .filter((fact) => !found.has(fact.id));
}

/**
 * Hybrid recall. The keyword leg always runs; the vector leg is best effort, so a
 * Vectorize or Workers AI outage degrades the answer instead of failing it. Trust
 * and validity are applied in SQL afterwards, so no unconfirmed fact can pass as
 * settled and `as_of` still answers for the past.
 */
export async function recall(
  sql: SqlStorage,
  backend: SearchBackend | null,
  namespace: string,
  query: RecallQuery,
  now: string,
): Promise<RecallView> {
  const text = typeof query.query === "string" ? query.query.trim() : "";
  if (text === "") {
    throw new MemoryError("invalid_input", "query must be a question or some words to look for");
  }
  const asOf = query.asOf === undefined ? now : normalizeTimestamp(query.asOf, "asOf");
  const limit = clampLimit(query.limit, DEFAULT_RECALL_LIMIT, MAX_RECALL_LIMIT);

  const keyword = ftsSearch(sql, text, CANDIDATES_PER_LEG);
  let semantic: string[] = [];
  let searchMode: "hybrid" | "keyword_only" = "keyword_only";
  if (backend !== null) {
    try {
      const [vector] = await backend.embed([text]);
      if (vector) {
        const hits = await backend.query(vector, namespace, CANDIDATES_PER_LEG);
        semantic = hits.map((hit) => hit.id);
        searchMode = "hybrid";
      }
    } catch (error) {
      console.error("keendreams recall: vector leg unavailable", error);
    }
  }

  const fused = fuse([keyword, semantic]).slice(0, MAX_FUSED);
  const scores = new Map(fused.map((entry) => [entry.id, entry.score]));
  const ranked = rankedFactIds(
    sql,
    fused.map((entry) => entry.id),
  );
  if (ranked.size === 0) return { searchMode, count: 0, results: [], related: [] };

  const ids = [...ranked.keys()].slice(0, MAX_FACT_IDS);
  const statusFilter = query.includeProposed
    ? `(f.status = 'proposed' OR (${CURRENT_AT}))`
    : `(${CURRENT_AT})`;
  const rows = sql
    .exec<FactRow>(
      `${SELECT_FACTS} WHERE f.id IN (${marks(ids.length)}) AND ${statusFilter}`,
      ...ids,
      ...currentAtBindings(asOf),
    )
    .toArray();

  const results = rows
    .map((row) =>
      toItem(
        row,
        scores.get(`fact:${row.id}`) ??
          scores.get(`episode:${row.ev_id}`) ??
          1 / (1 + (ranked.get(row.id) ?? ids.length)),
      ),
    )
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);

  return { searchMode, count: results.length, results, related: neighboursOf(sql, results, asOf) };
}
