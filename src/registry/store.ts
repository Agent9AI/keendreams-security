import { appendAudit } from "../memory/audit";
import { MemoryError } from "../memory/errors";
import { DEFAULT_WRITES_PER_MINUTE } from "../memory/limits";

export const DEFAULT_CLIENT = "default";
export const MAX_WRITES_PER_MINUTE = 10_000;

export type Mode = "single" | "multi";
export type MemberRole = "member" | "reviewer";
export type AccessRole = MemberRole | "admin";
export type ModeState = { mode: Mode; confirmed: boolean };
export type ClientAccess = { slug: string; role: AccessRole };
export type AccessQuery = { email: string; isAdmin: boolean; client?: string };
export type ClientRow = { slug: string; name: string; createdBy: string; createdAt: string };
export type MemberRow = {
  email: string;
  clientSlug: string;
  role: MemberRole;
  addedBy: string;
  addedAt: string;
};
export type AllowRule = {
  clientSlug: string;
  principalEmail: string;
  oauthClientId: string;
  source: string;
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const SOURCE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

export function parseSlug(raw: unknown): string {
  const slug = typeof raw === "string" ? raw.trim() : "";
  if (!SLUG.test(slug)) {
    throw new MemoryError(
      "invalid_input",
      "client must be 1 to 48 lowercase letters, digits or hyphens, not starting or ending with a hyphen",
    );
  }
  return slug;
}

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email)) {
    throw new MemoryError("invalid_input", "a valid email is required");
  }
  return email;
}

function clientExists(sql: SqlStorage, slug: string): boolean {
  return (
    sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM clients WHERE slug = ?", slug).one().n > 0
  );
}

function requireClient(sql: SqlStorage, slug: string): void {
  if (!clientExists(sql, slug)) {
    throw new MemoryError("not_found", `no client "${slug}"`);
  }
}

function record(
  sql: SqlStorage,
  actor: string,
  action: string,
  target: string,
  detail: Record<string, unknown>,
  now: string,
): void {
  appendAudit(sql, now, { actor, action, target, detail });
}

export function modeState(sql: SqlStorage): ModeState {
  const rows = sql
    .exec<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('mode', 'mode_confirmed')",
    )
    .toArray();
  const get = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    mode: get("mode") === "multi" ? "multi" : "single",
    confirmed: get("mode_confirmed") === "1",
  };
}

export function setMode(sql: SqlStorage, actor: string, mode: Mode, now: string): ModeState {
  if (mode !== "single" && mode !== "multi") {
    throw new MemoryError("invalid_input", "mode must be single or multi");
  }
  const upsert =
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value";
  sql.exec(upsert, "mode", mode);
  sql.exec(upsert, "mode_confirmed", "1");
  record(sql, normalizeEmail(actor), "registry.set_mode", "mode", { mode }, now);
  return { mode, confirmed: true };
}

export function createClient(
  sql: SqlStorage,
  actor: string,
  rawSlug: string,
  rawName: string,
  now: string,
): ClientRow {
  const by = normalizeEmail(actor);
  const slug = parseSlug(rawSlug);
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length < 1 || name.length > 120) {
    throw new MemoryError("invalid_input", "client name must be 1 to 120 characters");
  }
  if (clientExists(sql, slug)) {
    throw new MemoryError("invalid_input", `client "${slug}" already exists`);
  }
  sql.exec(
    "INSERT INTO clients (slug, name, created_by, created_at) VALUES (?, ?, ?, ?)",
    slug,
    name,
    by,
    now,
  );
  record(sql, by, "registry.create_client", slug, { name }, now);
  return { slug, name, createdBy: by, createdAt: now };
}

export function listClients(sql: SqlStorage): ClientRow[] {
  return sql
    .exec<{ slug: string; name: string; created_by: string; created_at: string }>(
      "SELECT slug, name, created_by, created_at FROM clients ORDER BY slug",
    )
    .toArray()
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
}

export function setMember(
  sql: SqlStorage,
  actor: string,
  rawEmail: string,
  rawSlug: string,
  role: MemberRole,
  now: string,
): MemberRow {
  const by = normalizeEmail(actor);
  const email = normalizeEmail(rawEmail);
  const slug = parseSlug(rawSlug);
  if (role !== "member" && role !== "reviewer") {
    throw new MemoryError("invalid_input", "role must be member or reviewer");
  }
  requireClient(sql, slug);
  sql.exec(
    `INSERT INTO members (email, client_slug, role, added_by, added_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (email, client_slug) DO UPDATE SET role = excluded.role, added_by = excluded.added_by, added_at = excluded.added_at`,
    email,
    slug,
    role,
    by,
    now,
  );
  record(sql, by, "registry.set_member", slug, { email, role }, now);
  return { email, clientSlug: slug, role, addedBy: by, addedAt: now };
}

export function removeMember(
  sql: SqlStorage,
  actor: string,
  rawEmail: string,
  rawSlug: string,
  now: string,
): boolean {
  const by = normalizeEmail(actor);
  const email = normalizeEmail(rawEmail);
  const slug = parseSlug(rawSlug);
  const removed = sql.exec(
    "DELETE FROM members WHERE email = ? AND client_slug = ?",
    email,
    slug,
  ).rowsWritten;
  if (removed > 0) record(sql, by, "registry.remove_member", slug, { email }, now);
  return removed > 0;
}

export function listMembers(sql: SqlStorage, rawSlug: string): MemberRow[] {
  const slug = parseSlug(rawSlug);
  return sql
    .exec<{ email: string; client_slug: string; role: string; added_by: string; added_at: string }>(
      "SELECT email, client_slug, role, added_by, added_at FROM members WHERE client_slug = ? ORDER BY email",
      slug,
    )
    .toArray()
    .map((row) => ({
      email: row.email,
      clientSlug: row.client_slug,
      role: row.role as MemberRole,
      addedBy: row.added_by,
      addedAt: row.added_at,
    }));
}

function parseRule(rule: AllowRule): AllowRule {
  const source = typeof rule.source === "string" ? rule.source.trim().toLowerCase() : "";
  if (!SOURCE.test(source)) {
    throw new MemoryError("invalid_input", "source must be 1 to 64 characters");
  }
  const oauthClientId = typeof rule.oauthClientId === "string" ? rule.oauthClientId.trim() : "";
  if (oauthClientId.length < 1 || oauthClientId.length > 200) {
    throw new MemoryError("invalid_input", "oauthClientId is required");
  }
  return {
    clientSlug: parseSlug(rule.clientSlug),
    principalEmail: normalizeEmail(rule.principalEmail),
    oauthClientId,
    source,
  };
}

export function allowSource(
  sql: SqlStorage,
  actor: string,
  raw: AllowRule,
  now: string,
): AllowRule {
  const by = normalizeEmail(actor);
  const rule = parseRule(raw);
  requireClient(sql, rule.clientSlug);
  sql.exec(
    `INSERT OR IGNORE INTO source_allowlist (client_slug, principal_email, oauth_client_id, source, added_by, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    rule.clientSlug,
    rule.principalEmail,
    rule.oauthClientId,
    rule.source,
    by,
    now,
  );
  record(sql, by, "registry.allow_source", rule.clientSlug, { ...rule }, now);
  return rule;
}

export function revokeSource(sql: SqlStorage, actor: string, raw: AllowRule, now: string): boolean {
  const by = normalizeEmail(actor);
  const rule = parseRule(raw);
  const removed = sql.exec(
    "DELETE FROM source_allowlist WHERE client_slug = ? AND principal_email = ? AND oauth_client_id = ? AND source = ?",
    rule.clientSlug,
    rule.principalEmail,
    rule.oauthClientId,
    rule.source,
  ).rowsWritten;
  if (removed > 0) record(sql, by, "registry.revoke_source", rule.clientSlug, { ...rule }, now);
  return removed > 0;
}

export function listAllowRules(sql: SqlStorage, rawSlug: string): AllowRule[] {
  const slug = parseSlug(rawSlug);
  return sql
    .exec<{
      client_slug: string;
      principal_email: string;
      oauth_client_id: string;
      source: string;
    }>(
      `SELECT client_slug, principal_email, oauth_client_id, source FROM source_allowlist
       WHERE client_slug = ? ORDER BY principal_email, oauth_client_id, source`,
      slug,
    )
    .toArray()
    .map((row) => ({
      clientSlug: row.client_slug,
      principalEmail: row.principal_email,
      oauthClientId: row.oauth_client_id,
      source: row.source,
    }));
}

export function isAllowlisted(sql: SqlStorage, raw: AllowRule): boolean {
  const rule = parseRule(raw);
  return (
    sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM source_allowlist
         WHERE client_slug = ? AND principal_email = ? AND oauth_client_id = ? AND source = ?`,
        rule.clientSlug,
        rule.principalEmail,
        rule.oauthClientId,
        rule.source,
      )
      .one().n > 0
  );
}

export function setWriteLimit(
  sql: SqlStorage,
  actor: string,
  rawSlug: string,
  writesPerMinute: number,
  now: string,
): number {
  const by = normalizeEmail(actor);
  const slug = parseSlug(rawSlug);
  if (
    !Number.isInteger(writesPerMinute) ||
    writesPerMinute < 1 ||
    writesPerMinute > MAX_WRITES_PER_MINUTE
  ) {
    throw new MemoryError(
      "invalid_input",
      `writes per minute must be 1 to ${MAX_WRITES_PER_MINUTE}`,
    );
  }
  requireClient(sql, slug);
  sql.exec(
    "INSERT INTO limits (client_slug, writes_per_minute) VALUES (?, ?) ON CONFLICT (client_slug) DO UPDATE SET writes_per_minute = excluded.writes_per_minute",
    slug,
    writesPerMinute,
  );
  record(sql, by, "registry.set_write_limit", slug, { writesPerMinute }, now);
  return writesPerMinute;
}

export function writeLimit(sql: SqlStorage, rawSlug: string): number {
  const slug = parseSlug(rawSlug);
  const row = sql
    .exec<{ writes_per_minute: number }>(
      "SELECT writes_per_minute FROM limits WHERE client_slug = ?",
      slug,
    )
    .toArray()[0];
  return row?.writes_per_minute ?? DEFAULT_WRITES_PER_MINUTE;
}

function memberRole(sql: SqlStorage, email: string, slug: string): MemberRole | null {
  const row = sql
    .exec<{ role: string }>(
      "SELECT role FROM members WHERE email = ? AND client_slug = ?",
      email,
      slug,
    )
    .toArray()[0];
  return row ? (row.role as MemberRole) : null;
}

/** Decides which client a signed-in person may open and with what role. */
export function resolveAccess(sql: SqlStorage, query: AccessQuery): ClientAccess {
  const email = normalizeEmail(query.email);
  const { mode } = modeState(sql);

  if (mode === "single") {
    if (query.client !== undefined && query.client !== DEFAULT_CLIENT) {
      throw new MemoryError(
        "forbidden_client",
        "this deployment serves a single team; leave the client parameter out",
      );
    }
    const role: AccessRole = query.isAdmin
      ? "admin"
      : (memberRole(sql, email, DEFAULT_CLIENT) ?? "member");
    return { slug: DEFAULT_CLIENT, role };
  }

  if (query.client === undefined) {
    throw new MemoryError("invalid_input", "client is required in multi-client mode");
  }
  const slug = parseSlug(query.client);
  const exists = clientExists(sql, slug);
  if (query.isAdmin) {
    if (!exists) throw new MemoryError("not_found", `no client "${slug}"`);
    return { slug, role: "admin" };
  }
  const role = exists ? memberRole(sql, email, slug) : null;
  if (!role) {
    throw new MemoryError("forbidden_client", `you do not have access to client "${slug}"`);
  }
  return { slug, role };
}
