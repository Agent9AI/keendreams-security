import { QUEUE_SCHEMA } from "../search/queue";
import { AUDIT_SCHEMA } from "./audit";

const V1: readonly string[] = [
  `CREATE TABLE episodes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    principal_email TEXT NOT NULL,
    oauth_client_id TEXT NOT NULL,
    oauth_client_name TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    redactions INTEGER NOT NULL DEFAULT 0,
    flags TEXT NOT NULL DEFAULT '[]',
    part_of TEXT,
    part_index INTEGER NOT NULL DEFAULT 0,
    observed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`,
  "CREATE UNIQUE INDEX episodes_content_hash ON episodes (content_hash) WHERE part_of IS NULL",
  "CREATE INDEX episodes_part_of ON episodes (part_of, part_index)",
  `CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    canonical_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object_id TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    evidence_episode_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'trusted', 'rejected', 'superseded')),
    origin TEXT NOT NULL CHECK (origin IN ('mcp', 'allowlisted_source', 'ai_suggestion')),
    proposed_by TEXT NOT NULL,
    suggested_by_model TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    recorded_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    confirmed_by TEXT,
    confirmed_at TEXT,
    rejected_by TEXT,
    rejected_at TEXT,
    decision_audit_seq INTEGER,
    superseded_by TEXT,
    superseded_at TEXT,
    superseded_audit_seq INTEGER
  )`,
  "CREATE INDEX facts_spo ON facts (subject_id, predicate, object_id, status)",
  "CREATE INDEX facts_object ON facts (object_id, predicate, status)",
  "CREATE INDEX facts_status ON facts (status, recorded_at)",
  `CREATE TABLE fact_evidence (
    fact_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (fact_id, episode_id)
  )`,
  ...AUDIT_SCHEMA,
  "CREATE VIRTUAL TABLE fts USING fts5(kind UNINDEXED, ref_id UNINDEXED, text)",
  `CREATE TABLE write_counters (
    principal TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    count INTEGER NOT NULL
  )`,
];

/** Search support: work waiting to be indexed, and what this client is called. */
const V2: readonly string[] = [
  ...QUEUE_SCHEMA,
  "CREATE TABLE memory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

/** Each entry is one schema version; statements run one at a time. */
export const MIGRATIONS: readonly (readonly string[])[] = [V1, V2];

export function schemaVersion(sql: SqlStorage): number {
  sql.exec("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = sql
    .exec<{ value: string }>("SELECT value FROM schema_meta WHERE key = 'version'")
    .toArray()[0];
  return row ? Number(row.value) : 0;
}

/** Runs every migration version newer than the database's recorded version. */
export function runMigrations(sql: SqlStorage, migrations: readonly (readonly string[])[]): number {
  let version = schemaVersion(sql);
  while (version < migrations.length) {
    for (const statement of migrations[version] ?? []) {
      sql.exec(statement);
    }
    version += 1;
    sql.exec(
      "INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(version),
    );
  }
  return version;
}

export function migrate(sql: SqlStorage): number {
  return runMigrations(sql, MIGRATIONS);
}
