import { AUDIT_SCHEMA } from "../memory/audit";
import { runMigrations } from "../memory/schema";

const V1: readonly string[] = [
  "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  `CREATE TABLE clients (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE members (
    email TEXT NOT NULL,
    client_slug TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('member', 'reviewer')),
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (email, client_slug)
  )`,
  `CREATE TABLE source_allowlist (
    client_slug TEXT NOT NULL,
    principal_email TEXT NOT NULL,
    oauth_client_id TEXT NOT NULL,
    source TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (client_slug, principal_email, oauth_client_id, source)
  )`,
  "CREATE TABLE limits (client_slug TEXT PRIMARY KEY, writes_per_minute INTEGER NOT NULL)",
  ...AUDIT_SCHEMA,
  "INSERT INTO clients (slug, name, created_by, created_at) VALUES ('default', 'Default', 'system', '1970-01-01T00:00:00.000Z')",
];

export const REGISTRY_MIGRATIONS: readonly (readonly string[])[] = [V1];

export function migrateRegistry(sql: SqlStorage): number {
  return runMigrations(sql, REGISTRY_MIGRATIONS);
}
