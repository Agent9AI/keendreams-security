/**
 * Terms kept from a question. Everything else, quotes and asterisks included, is
 * punctuation that FTS5 would otherwise read as query syntax.
 */
const TERM = /[a-z0-9][a-z0-9._:@-]*/gi;
const MIN_TERM_CHARS = 2;
const MAX_TERMS = 20;

/**
 * Builds a safe FTS5 MATCH expression. Terms come only from the pattern above and
 * are then quoted, so a question containing a hyphen, a colon or a quote cannot
 * change the query's meaning. Returns null when nothing worth searching is left.
 */
export function ftsQuery(text: string): string | null {
  if (typeof text !== "string") return null;
  const terms = (text.match(TERM) ?? [])
    .filter((term) => term.length >= MIN_TERM_CHARS)
    .slice(0, MAX_TERMS)
    .map((term) => `"${term}"`);
  return terms.length === 0 ? null : terms.join(" OR ");
}

/** Item ids (`<kind>:<ref_id>`) ranked by BM25, best first. */
export function ftsSearch(sql: SqlStorage, text: string, limit: number): string[] {
  const match = ftsQuery(text);
  if (match === null) return [];
  try {
    return sql
      .exec<{ kind: string; ref_id: string }>(
        "SELECT kind, ref_id FROM fts WHERE fts MATCH ? ORDER BY bm25(fts) LIMIT ?",
        match,
        limit,
      )
      .toArray()
      .map((row) => `${row.kind}:${row.ref_id}`);
  } catch (error) {
    // A malformed expression must never take down a recall; the vector leg and
    // the trust filter still produce an answer.
    console.error("keendreams search: full text query failed", error);
    return [];
  }
}
