import type { CanonicalKey } from "./keys";

/** Returns the entity id for a canonical key, creating the entity on first use. */
export function upsertEntity(
  sql: SqlStorage,
  key: CanonicalKey,
  now: string,
  newId: () => string,
): string {
  const existing = sql
    .exec<{ id: string }>("SELECT id FROM entities WHERE canonical_key = ?", key.key)
    .toArray()[0];
  if (existing) return existing.id;
  const id = newId();
  sql.exec(
    "INSERT INTO entities (id, kind, canonical_key, display_name, attributes, created_at) VALUES (?, ?, ?, ?, '{}', ?)",
    id,
    key.kind,
    key.key,
    key.value,
    now,
  );
  sql.exec(
    "INSERT INTO fts (kind, ref_id, text) VALUES ('entity', ?, ?)",
    id,
    `${key.key} ${key.value}`,
  );
  return id;
}
