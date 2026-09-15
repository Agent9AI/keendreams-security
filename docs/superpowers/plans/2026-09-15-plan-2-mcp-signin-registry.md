# KeenDreams Security Memory, Plan 2: MCP Server, Sign-in and Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the memory core behind a remote MCP server that people and agents sign in to with the deployer's Cloudflare Access, with a Registry that decides who may use which client and which sources are trusted.

**Architecture:** `@cloudflare/workers-oauth-provider` wraps the Worker. Browser sign-in routes (`/authorize`, `/callback`) proxy to the deployer's Access for SaaS app, verify the ID token and issue the Worker's own token. `/mcp` is served by MCP SDK v2's `createMcpHandler`, one server per request, with the signed-in identity passed as `authInfo.extra.props`. Tools resolve the client through a single `Registry` Durable Object, decide trust origin from the allowlist, and call the per-client `ClientMemory` Durable Object from Plan 1.

**Tech Stack:** `@modelcontextprotocol/server@2.0.0`, `zod@4.6.5`, `@cloudflare/workers-oauth-provider@0.10.3`, Durable Objects (SQLite), Workers KV, WebCrypto (RS256, HMAC-SHA256), Vitest 4.1.11 with `@cloudflare/vitest-plugin` 1.1.10.

**Spec:** `docs/superpowers/specs/2026-09-15-keendreams-security-memory-design.md` (sections 3, 4, 6, 7, 8, 10, 11, 15)

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-09-15-plan-1-memory-core.md`). **Deferred:** `recall` and `suggest_facts` (Plan 3), `/review` and `/admin` pages (Plan 4).

## Global Constraints

- Everything in Plan 1's Global Constraints still applies (versions, `overrides.vite`, no em-dashes, no `Co-Authored-By`, runtime-assembled fake credentials, files under 500 lines, error code prefixes, ISO timestamps).
- Exact runtime dependencies: `@modelcontextprotocol/server@2.0.0`, `zod@4.6.5`, `@cloudflare/workers-oauth-provider@0.10.3`. Do **not** add the `agents` package.
- `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]`.
- `OAUTH_KV` is declared without an `id` so Deploy to Cloudflare can provision it.
- The OAuth `userId` is the Access `sub`. Emails are never used as OAuth user ids.
- Access tokens, refresh tokens, ID tokens, client secrets and cookie keys are never logged, returned in responses or written to memory.
- Every outbound network call (Access token and JWKS endpoints) goes through an injected `fetch` so tests run fully offline.
- MCP tool inputs are validated with zod at the boundary; tool failures return `isError: true` with a message that starts with a stable error code. Unexpected errors return `unavailable: …` without internal details.
- Consent and upstream sign-in state live server-side in `OAUTH_KV` for 600 seconds and are consumed once.
- Test RSA keys are generated at runtime with WebCrypto. No key material is committed.

## File Structure

| File | Responsibility |
|------|----------------|
| `.dev.vars.example` | Names of the deployer's settings (no values) |
| `package.json` (`cloudflare.bindings`) | Deploy screen descriptions |
| `wrangler.jsonc` | Flags, `OAUTH_KV`, `REGISTRY` Durable Object, migration `v2` |
| `src/config.ts` | Typed settings: Access endpoints, derived issuer, cookie key, admin emails |
| `src/memory/audit.ts` | Adds `AUDIT_SCHEMA` shared by both databases |
| `src/memory/schema.ts` | Adds `runMigrations`, used by both databases |
| `src/registry/schema.ts` | Registry migrations |
| `src/registry/registry.ts` | Mode, clients, members, allowlist, limits, access resolution |
| `src/registry/Registry.ts` | Registry Durable Object RPC surface |
| `src/auth/onceStore.ts` | Store a value in KV for a short time and consume it once |
| `src/auth/access.ts` | PKCE, Access authorize URL, code exchange, ID token verification |
| `src/auth/cookies.ts` | HMAC-signed approved-clients cookie, CSRF token |
| `src/auth/consent.ts` | Consent page HTML |
| `src/auth/handler.ts` | `/authorize` (GET, POST) and `/callback` routes |
| `src/auth/types.ts` | `AuthProps` carried in tokens |
| `src/memory/episodes.ts`, `src/memory/ClientMemory.ts` | Add `episodeMeta` read |
| `src/mcp/results.ts` | Tool result and error shaping |
| `src/mcp/context.ts` | Principal, client resolution, trust origin |
| `src/mcp/tools.ts` | The seven Plan 2 tools |
| `src/mcp/server.ts` | `createMcpHandler` factory and the `/mcp` API handler |
| `src/worker.ts` | `OAuthProvider` wiring and Durable Object exports |
| `tests/…` | One test file per unit plus an end-to-end test |

---

### Task 1: Dependencies, deploy configuration and typed settings

**Files:**
- Modify: `package.json`, `package-lock.json`, `wrangler.jsonc`, `worker-configuration.d.ts` (regenerated)
- Create: `.dev.vars.example`, `src/config.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces: `SETTING_NAMES`, `type SettingName`, `type AppSettings = Partial<Record<SettingName, string>>`, `class SetupError extends Error { missing: SettingName[] }`, `type AccessSettings = { clientId: string; clientSecret: string; authorizationUrl: string; tokenUrl: string; jwksUrl: string; issuer: string; cookieKey: string }`, `readAccessSettings(env: AppSettings): AccessSettings`, `adminEmails(env: AppSettings): Set<string>`.

- [ ] **Step 1: Install runtime dependencies**

Run: `npm install --save-exact @modelcontextprotocol/server@2.0.0 zod@4.6.5 @cloudflare/workers-oauth-provider@0.10.3`
Expected: `dependencies` lists exactly those three; `npm ls vite` still shows only `vite@7.3.6`.

- [ ] **Step 2: Update `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "keendreams-security",
  "main": "src/worker.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "observability": { "enabled": true },
  "kv_namespaces": [{ "binding": "OAUTH_KV" }],
  "durable_objects": {
    "bindings": [{ "name": "CLIENT_MEMORY", "class_name": "ClientMemory" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ClientMemory"] }]
}
```

- [ ] **Step 3: Create `.dev.vars.example`**

```
# Copy to .dev.vars for local development. Never commit .dev.vars.
# Values come from your Cloudflare One Access for SaaS (OIDC) application.
ACCESS_CLIENT_ID=
ACCESS_CLIENT_SECRET=
ACCESS_AUTHORIZATION_URL=
ACCESS_TOKEN_URL=
ACCESS_JWKS_URL=
# Optional. Set only if the live check shows Access uses a different issuer.
ACCESS_ISSUER=
# Generate with: openssl rand -hex 32
COOKIE_ENCRYPTION_KEY=
# Comma-separated admin emails, for example: you@company.com
ADMIN_EMAILS=
```

- [ ] **Step 4: Add deploy screen descriptions to `package.json`**

Add this top-level block after `"overrides"`:

```json
  "cloudflare": {
    "bindings": {
      "ACCESS_CLIENT_ID": {
        "description": "Client ID of your Cloudflare One **Access for SaaS** application (OIDC). See the [sign-in setup guide](https://github.com/Agent9AI/keendreams-security#sign-in-setup)."
      },
      "ACCESS_CLIENT_SECRET": {
        "description": "Client secret of the same Access for SaaS application."
      },
      "ACCESS_AUTHORIZATION_URL": {
        "description": "Authorization endpoint of the Access for SaaS application, ending in `/authorization`."
      },
      "ACCESS_TOKEN_URL": {
        "description": "Token endpoint of the Access for SaaS application, ending in `/token`."
      },
      "ACCESS_JWKS_URL": {
        "description": "Key endpoint of the Access for SaaS application, ending in `/jwks`."
      },
      "ACCESS_ISSUER": {
        "description": "Optional. Only needed if your Access application reports an issuer other than the token endpoint without `/token`."
      },
      "COOKIE_ENCRYPTION_KEY": {
        "description": "Random string that signs sign-in cookies. Generate it with `openssl rand -hex 32`."
      },
      "ADMIN_EMAILS": {
        "description": "Comma-separated emails of the people who administer this memory, for example `you@company.com`."
      },
      "OAUTH_KV": {
        "description": "Stores OAuth grants and short-lived sign-in state."
      },
      "CLIENT_MEMORY": {
        "description": "One private SQLite database per client."
      }
    }
  }
```

- [ ] **Step 5: Write the failing test `tests/config.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { type AppSettings, adminEmails, readAccessSettings, SetupError } from "../src/config";

const BASE = "https://team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/abc123";

function settings(overrides: AppSettings = {}): AppSettings {
  return {
    ACCESS_CLIENT_ID: "abc123",
    ACCESS_CLIENT_SECRET: ["test", "client", "secret"].join("-"),
    ACCESS_AUTHORIZATION_URL: `${BASE}/authorization`,
    ACCESS_TOKEN_URL: `${BASE}/token`,
    ACCESS_JWKS_URL: `${BASE}/jwks`,
    COOKIE_ENCRYPTION_KEY: "k".repeat(64),
    ADMIN_EMAILS: "admin@example.com",
    ...overrides,
  };
}

function setupErrorOf(fn: () => unknown): SetupError {
  try {
    fn();
  } catch (err) {
    if (err instanceof SetupError) return err;
    throw err;
  }
  throw new Error("expected a SetupError");
}

describe("readAccessSettings", () => {
  it("reads settings and derives the issuer from the token URL", () => {
    const access = readAccessSettings(settings());
    expect(access.issuer).toBe(BASE);
    expect(access.clientId).toBe("abc123");
    expect(access.jwksUrl).toBe(`${BASE}/jwks`);
  });

  it("prefers an explicit issuer when Access reports a different one", () => {
    const access = readAccessSettings(settings({ ACCESS_ISSUER: "https://team.cloudflareaccess.com" }));
    expect(access.issuer).toBe("https://team.cloudflareaccess.com");
    const err = setupErrorOf(() => readAccessSettings(settings({ ACCESS_ISSUER: "http://team.example" })));
    expect(err.missing).toEqual(["ACCESS_ISSUER"]);
  });

  it("lists every missing setting without echoing values", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_CLIENT_ID: "", ACCESS_JWKS_URL: undefined })),
    );
    expect(err.missing).toEqual(["ACCESS_CLIENT_ID", "ACCESS_JWKS_URL"]);
    expect(err.message).not.toContain("test-client-secret");
  });

  it("rejects endpoints that are not https", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_TOKEN_URL: "http://team.example/token" })),
    );
    expect(err.missing).toEqual(["ACCESS_TOKEN_URL"]);
  });

  it("requires the token URL to end with /token", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_TOKEN_URL: `${BASE}/oauth` })),
    );
    expect(err.missing).toEqual(["ACCESS_TOKEN_URL"]);
  });

  it("requires a cookie key of at least 32 characters", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ COOKIE_ENCRYPTION_KEY: "short" })),
    );
    expect(err.missing).toEqual(["COOKIE_ENCRYPTION_KEY"]);
  });
});

describe("adminEmails", () => {
  it("parses a comma-separated list, lowercases it and drops invalid entries", () => {
    expect([...adminEmails({ ADMIN_EMAILS: " A@Example.com, b@example.com ,, not-an-email" })]).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("returns an empty set when unset", () => {
    expect(adminEmails({}).size).toBe(0);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL, cannot find module `../src/config`.

- [ ] **Step 7: Create `src/config.ts`**

```ts
export const SETTING_NAMES = [
  "ACCESS_CLIENT_ID",
  "ACCESS_CLIENT_SECRET",
  "ACCESS_AUTHORIZATION_URL",
  "ACCESS_TOKEN_URL",
  "ACCESS_JWKS_URL",
  "ACCESS_ISSUER",
  "COOKIE_ENCRYPTION_KEY",
  "ADMIN_EMAILS",
] as const;

export type SettingName = (typeof SETTING_NAMES)[number];

/** Deployer settings arrive as Worker secrets; any of them may be missing. */
export type AppSettings = Partial<Record<SettingName, string>>;

/** Thrown when the deployment is not configured. Names only, never values. */
export class SetupError extends Error {
  readonly missing: SettingName[];

  constructor(missing: SettingName[], detail: string) {
    super(`KeenDreams Security Memory is not set up: ${detail}`);
    this.name = "SetupError";
    this.missing = missing;
  }
}

export type AccessSettings = {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuer: string;
  cookieKey: string;
};

/** Settings the deployment works without. `ACCESS_ISSUER` only overrides the derived issuer. */
const OPTIONAL_SETTINGS: SettingName[] = ["ADMIN_EMAILS", "ACCESS_ISSUER"];
const ACCESS_SETTINGS: SettingName[] = SETTING_NAMES.filter((name) => !OPTIONAL_SETTINGS.includes(name));

function httpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function readAccessSettings(env: AppSettings): AccessSettings {
  const missing = ACCESS_SETTINGS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new SetupError(missing, `missing settings ${missing.join(", ")}`);
  }
  const value = (name: SettingName) => (env[name] ?? "").trim();

  const invalidUrls = (["ACCESS_AUTHORIZATION_URL", "ACCESS_TOKEN_URL", "ACCESS_JWKS_URL"] as const)
    .filter((name) => !httpsUrl(value(name)));
  if (invalidUrls.length > 0) {
    throw new SetupError(invalidUrls, `${invalidUrls.join(", ")} must be https URLs`);
  }

  const tokenUrl = value("ACCESS_TOKEN_URL");
  if (!/\/token\/?$/.test(tokenUrl)) {
    throw new SetupError(
      ["ACCESS_TOKEN_URL"],
      "ACCESS_TOKEN_URL must end with /token (copy it from your Access for SaaS app)",
    );
  }

  if (value("COOKIE_ENCRYPTION_KEY").length < 32) {
    throw new SetupError(
      ["COOKIE_ENCRYPTION_KEY"],
      "COOKIE_ENCRYPTION_KEY must be at least 32 characters (openssl rand -hex 32)",
    );
  }

  const issuerOverride = value("ACCESS_ISSUER");
  if (issuerOverride && !httpsUrl(issuerOverride)) {
    throw new SetupError(["ACCESS_ISSUER"], "ACCESS_ISSUER must be an https URL");
  }

  return {
    clientId: value("ACCESS_CLIENT_ID"),
    clientSecret: value("ACCESS_CLIENT_SECRET"),
    authorizationUrl: value("ACCESS_AUTHORIZATION_URL"),
    tokenUrl,
    jwksUrl: value("ACCESS_JWKS_URL"),
    issuer: issuerOverride || tokenUrl.replace(/\/token\/?$/, ""),
    cookieKey: value("COOKIE_ENCRYPTION_KEY"),
  };
}

export function adminEmails(env: AppSettings): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^[^\s@]+@[^\s@]+$/.test(entry)),
  );
}
```

- [ ] **Step 8: Regenerate types, run tests, typecheck and lint**

Run: `npx wrangler types && npm test && npm run typecheck && npm run lint`
Expected: `worker-configuration.d.ts` declares `OAUTH_KV: KVNamespace`; all tests PASS (Plan 1 plus 8 new); typecheck and lint exit 0.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc worker-configuration.d.ts .dev.vars.example src/config.ts tests/config.test.ts
git commit -m "Add MCP and OAuth dependencies, deploy settings and typed config"
```

---

### Task 2: Registry Durable Object

**Files:**
- Modify: `src/memory/audit.ts` (add `AUDIT_SCHEMA`), `src/memory/schema.ts` (use `AUDIT_SCHEMA`, add `runMigrations`), `wrangler.jsonc`, `package.json` (`REGISTRY` description), `src/worker.ts`, `worker-configuration.d.ts`, `tests/helpers.ts`
- Create: `src/registry/schema.ts`, `src/registry/registry.ts`, `src/registry/Registry.ts`, `tests/registry.test.ts`

**Interfaces:**
- Consumes: `appendAudit`, `verifyAuditChain`, `type ChainCheck` (Plan 1 Task 4); `MemoryError` (Plan 1 Task 1); `clampLimit` (Plan 1 Task 5); `DEFAULT_WRITES_PER_MINUTE` (Plan 1 Task 5).
- Produces:
  - `AUDIT_SCHEMA: readonly string[]`, `runMigrations(sql: SqlStorage, migrations: readonly (readonly string[])[]): number`.
  - `DEFAULT_CLIENT = "default"`, `type Mode = "single" | "multi"`, `type MemberRole = "member" | "reviewer"`, `type AccessRole = MemberRole | "admin"`, `type ModeState = { mode: Mode; confirmed: boolean }`, `type ClientAccess = { slug: string; role: AccessRole }`, `type AccessQuery = { email: string; isAdmin: boolean; client?: string }`, `type ClientRow`, `type MemberRow`, `type AllowRule = { clientSlug: string; principalEmail: string; oauthClientId: string; source: string }`.
  - RPC on `Registry`: `resolveAccess(query: AccessQuery): ClientAccess`, `modeState(): ModeState`, `setMode(actor: string, mode: Mode): ModeState`, `createClient(actor: string, slug: string, name: string): ClientRow`, `listClients(): ClientRow[]`, `setMember(actor: string, email: string, slug: string, role: MemberRole): MemberRow`, `removeMember(actor: string, email: string, slug: string): boolean`, `listMembers(slug: string): MemberRow[]`, `allowSource(actor: string, rule: AllowRule): AllowRule`, `revokeSource(actor: string, rule: AllowRule): boolean`, `listAllowRules(slug: string): AllowRule[]`, `isAllowlisted(rule: AllowRule): boolean`, `setWriteLimit(actor: string, slug: string, writesPerMinute: number): number`, `writeLimit(slug: string): number`, `verifyAuditChain(): ChainCheck`.
  - Test helper `freshRegistry(): DurableObjectStub<Registry>`.

- [ ] **Step 1: Add `AUDIT_SCHEMA` to the top of `src/memory/audit.ts`**

Insert after the `import` line:

```ts
/** Audit table and append-only triggers, shared by every database that keeps an audit log. */
export const AUDIT_SCHEMA: readonly string[] = [
  `CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL
  )`,
  "CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
  "CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
];
```

- [ ] **Step 2: Refactor `src/memory/schema.ts` to share the audit schema and the migration runner**

In `V1`, replace the three statements that create `audit_log` and its two triggers with a single spread element `...AUDIT_SCHEMA,` at the same position, and add `import { AUDIT_SCHEMA } from "./audit";` at the top. Then replace the `migrate` function with:

```ts
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
```

Run: `npx vitest run tests/audit.test.ts`
Expected: PASS (the schema is unchanged, only reorganized).

- [ ] **Step 3: Add the Registry binding and migration to `wrangler.jsonc`**

Replace the `durable_objects` and `migrations` entries with:

```jsonc
  "durable_objects": {
    "bindings": [
      { "name": "CLIENT_MEMORY", "class_name": "ClientMemory" },
      { "name": "REGISTRY", "class_name": "Registry" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["ClientMemory"] },
    { "tag": "v2", "new_sqlite_classes": ["Registry"] }
  ]
```

In `package.json` `cloudflare.bindings`, add:

```json
      "REGISTRY": {
        "description": "Who may use which client, who reviews, and which automation sources are trusted."
      }
```

- [ ] **Step 4: Create `src/registry/schema.ts`**

```ts
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
```

- [ ] **Step 5: Add `freshRegistry` to `tests/helpers.ts`**

Add below `freshMemory`:

```ts
/** A new, empty Registry per call. */
export function freshRegistry(): DurableObjectStub<Registry> {
  return env.REGISTRY.getByName(`registry-test-${crypto.randomUUID()}`);
}
```

and add `import type { Registry } from "../src/registry/Registry";` to the imports.

- [ ] **Step 6: Write the failing test `tests/registry.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { memoryErrorCode } from "../src/memory/errors";
import { freshRegistry } from "./helpers";

const ADMIN = "admin@example.com";
const BOT = { principalEmail: "sync@example.com", oauthClientId: "client-sync", source: "tenable-hexa" };

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (err) {
    return memoryErrorCode(err);
  }
  return null;
}

describe("single-team mode", () => {
  it("starts in single mode, unconfirmed, with a default client", async () => {
    const registry = freshRegistry();
    expect(await registry.modeState()).toEqual({ mode: "single", confirmed: false });
    expect((await registry.listClients()).map((c) => c.slug)).toEqual(["default"]);
  });

  it("gives every signed-in user member access to the default client", async () => {
    const registry = freshRegistry();
    expect(await registry.resolveAccess({ email: "Alice@Example.com", isAdmin: false })).toEqual({
      slug: "default",
      role: "member",
    });
    expect(await registry.resolveAccess({ email: ADMIN, isAdmin: true })).toEqual({
      slug: "default",
      role: "admin",
    });
  });

  it("uses reviewer roles set by an admin", async () => {
    const registry = freshRegistry();
    await registry.setMember(ADMIN, "rita@example.com", "default", "reviewer");
    expect(await registry.resolveAccess({ email: "rita@example.com", isAdmin: false })).toEqual({
      slug: "default",
      role: "reviewer",
    });
  });

  it("refuses any other client name", async () => {
    const registry = freshRegistry();
    expect(
      await codeOf(registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "acme" })),
    ).toBe("forbidden_client");
  });
});

describe("multi-client mode", () => {
  async function multi() {
    const registry = freshRegistry();
    expect(await registry.setMode(ADMIN, "multi")).toEqual({ mode: "multi", confirmed: true });
    await registry.createClient(ADMIN, "acme", "Acme Corp");
    await registry.setMember(ADMIN, "alice@example.com", "acme", "member");
    return registry;
  }

  it("requires a client", async () => {
    const registry = await multi();
    expect(await codeOf(registry.resolveAccess({ email: "alice@example.com", isAdmin: false }))).toBe(
      "invalid_input",
    );
  });

  it("allows members and refuses everyone else", async () => {
    const registry = await multi();
    expect(
      await registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "acme" }),
    ).toEqual({ slug: "acme", role: "member" });
    expect(
      await codeOf(registry.resolveAccess({ email: "bob@example.com", isAdmin: false, client: "acme" })),
    ).toBe("forbidden_client");
    expect(
      await codeOf(registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "nope" })),
    ).toBe("forbidden_client");
  });

  it("gives admins every existing client and a clear error for unknown ones", async () => {
    const registry = await multi();
    expect(await registry.resolveAccess({ email: ADMIN, isAdmin: true, client: "acme" })).toEqual({
      slug: "acme",
      role: "admin",
    });
    expect(await codeOf(registry.resolveAccess({ email: ADMIN, isAdmin: true, client: "nope" }))).toBe(
      "not_found",
    );
  });

  it("stops access when a member is removed", async () => {
    const registry = await multi();
    expect(await registry.removeMember(ADMIN, "alice@example.com", "acme")).toBe(true);
    expect(
      await codeOf(registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "acme" })),
    ).toBe("forbidden_client");
  });
});

describe("clients", () => {
  it("validates slugs and rejects duplicates", async () => {
    const registry = freshRegistry();
    expect(await codeOf(registry.createClient(ADMIN, "Bad Slug", "x"))).toBe("invalid_input");
    expect(await codeOf(registry.createClient(ADMIN, "-acme", "x"))).toBe("invalid_input");
    await registry.createClient(ADMIN, "acme", "Acme");
    expect(await codeOf(registry.createClient(ADMIN, "acme", "Acme again"))).toBe("invalid_input");
  });
});

describe("source allowlist", () => {
  it("matches the exact principal, OAuth client and source", async () => {
    const registry = freshRegistry();
    const rule = { clientSlug: "default", ...BOT };
    expect(await registry.isAllowlisted(rule)).toBe(false);
    await registry.allowSource(ADMIN, rule);
    expect(await registry.isAllowlisted(rule)).toBe(true);
    expect(await registry.isAllowlisted({ ...rule, source: "pasted-chat" })).toBe(false);
    expect(await registry.isAllowlisted({ ...rule, oauthClientId: "other-client" })).toBe(false);
    expect(await registry.listAllowRules("default")).toEqual([rule]);
    expect(await registry.revokeSource(ADMIN, rule)).toBe(true);
    expect(await registry.isAllowlisted(rule)).toBe(false);
  });

  it("refuses rules for unknown clients", async () => {
    const registry = freshRegistry();
    expect(await codeOf(registry.allowSource(ADMIN, { clientSlug: "nope", ...BOT }))).toBe("not_found");
  });
});

describe("write limits", () => {
  it("defaults to 120 per minute and accepts 1 to 10,000", async () => {
    const registry = freshRegistry();
    expect(await registry.writeLimit("default")).toBe(120);
    expect(await registry.setWriteLimit(ADMIN, "default", 30)).toBe(30);
    expect(await registry.writeLimit("default")).toBe(30);
    expect(await codeOf(registry.setWriteLimit(ADMIN, "default", 0))).toBe("invalid_input");
    expect(await codeOf(registry.setWriteLimit(ADMIN, "default", 10_001))).toBe("invalid_input");
  });
});

describe("registry audit", () => {
  it("records admin changes in a verifiable chain", async () => {
    const registry = freshRegistry();
    await registry.setMode(ADMIN, "multi");
    await registry.createClient(ADMIN, "acme", "Acme");
    await registry.allowSource(ADMIN, { clientSlug: "acme", ...BOT });
    expect(await registry.verifyAuditChain()).toEqual({ ok: true, rows: 3 });
  });

  it("requires a valid actor email", async () => {
    const registry = freshRegistry();
    expect(await codeOf(registry.createClient("not-an-email", "acme", "Acme"))).toBe("invalid_input");
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run tests/registry.test.ts`
Expected: FAIL (the `REGISTRY` binding's class `Registry` is not exported yet).

- [ ] **Step 8: Create `src/registry/registry.ts`**

```ts
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
  return sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM clients WHERE slug = ?", slug).one().n > 0;
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
  return { mode: get("mode") === "multi" ? "multi" : "single", confirmed: get("mode_confirmed") === "1" };
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
  const removed = sql.exec("DELETE FROM members WHERE email = ? AND client_slug = ?", email, slug)
    .rowsWritten;
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

export function allowSource(sql: SqlStorage, actor: string, raw: AllowRule, now: string): AllowRule {
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
    .exec<{ client_slug: string; principal_email: string; oauth_client_id: string; source: string }>(
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
  if (!Number.isInteger(writesPerMinute) || writesPerMinute < 1 || writesPerMinute > MAX_WRITES_PER_MINUTE) {
    throw new MemoryError("invalid_input", `writes per minute must be 1 to ${MAX_WRITES_PER_MINUTE}`);
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
    .exec<{ role: string }>("SELECT role FROM members WHERE email = ? AND client_slug = ?", email, slug)
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
```

- [ ] **Step 9: Create `src/registry/Registry.ts` and export it from `src/worker.ts`**

`src/registry/Registry.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { type ChainCheck, verifyAuditChain } from "../memory/audit";
import {
  type AccessQuery,
  type AllowRule,
  allowSource,
  type ClientAccess,
  type ClientRow,
  createClient,
  isAllowlisted,
  listAllowRules,
  listClients,
  listMembers,
  type MemberRole,
  type MemberRow,
  type Mode,
  type ModeState,
  modeState,
  removeMember,
  resolveAccess,
  revokeSource,
  setMember,
  setMode,
  setWriteLimit,
  writeLimit,
} from "./registry";
import { migrateRegistry } from "./schema";

/** The single deployment-wide registry, addressed by name `registry`. */
export class Registry extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => migrateRegistry(this.sql));
    });
  }

  resolveAccess(query: AccessQuery): ClientAccess {
    return resolveAccess(this.sql, query);
  }

  modeState(): ModeState {
    return modeState(this.sql);
  }

  setMode(actor: string, mode: Mode): ModeState {
    return this.write(() => setMode(this.sql, actor, mode, this.now()));
  }

  createClient(actor: string, slug: string, name: string): ClientRow {
    return this.write(() => createClient(this.sql, actor, slug, name, this.now()));
  }

  listClients(): ClientRow[] {
    return listClients(this.sql);
  }

  setMember(actor: string, email: string, slug: string, role: MemberRole): MemberRow {
    return this.write(() => setMember(this.sql, actor, email, slug, role, this.now()));
  }

  removeMember(actor: string, email: string, slug: string): boolean {
    return this.write(() => removeMember(this.sql, actor, email, slug, this.now()));
  }

  listMembers(slug: string): MemberRow[] {
    return listMembers(this.sql, slug);
  }

  allowSource(actor: string, rule: AllowRule): AllowRule {
    return this.write(() => allowSource(this.sql, actor, rule, this.now()));
  }

  revokeSource(actor: string, rule: AllowRule): boolean {
    return this.write(() => revokeSource(this.sql, actor, rule, this.now()));
  }

  listAllowRules(slug: string): AllowRule[] {
    return listAllowRules(this.sql, slug);
  }

  isAllowlisted(rule: AllowRule): boolean {
    return isAllowlisted(this.sql, rule);
  }

  setWriteLimit(actor: string, slug: string, writesPerMinute: number): number {
    return this.write(() => setWriteLimit(this.sql, actor, slug, writesPerMinute, this.now()));
  }

  writeLimit(slug: string): number {
    return writeLimit(this.sql, slug);
  }

  verifyAuditChain(): ChainCheck {
    return verifyAuditChain(this.sql);
  }

  private write<T>(fn: () => T): T {
    return this.ctx.storage.transactionSync(fn);
  }

  private now(): string {
    return new Date().toISOString();
  }
}
```

`src/worker.ts`:

```ts
export { ClientMemory } from "./memory/ClientMemory";
export { Registry } from "./registry/Registry";

export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 10: Regenerate types, run tests, typecheck and lint**

Run: `npx wrangler types && npm test && npm run typecheck && npm run lint`
Expected: `worker-configuration.d.ts` declares `REGISTRY: DurableObjectNamespace<import("./src/worker").Registry>`; all tests PASS; typecheck and lint exit 0 (run `npm run format` first if only formatting is reported).

- [ ] **Step 11: Commit**

```bash
git add src/memory/audit.ts src/memory/schema.ts src/registry wrangler.jsonc package.json src/worker.ts worker-configuration.d.ts tests/helpers.ts tests/registry.test.ts
git commit -m "Add Registry Durable Object for modes, clients, members, allowlist and limits"
```

---

### Task 3: Sign-in primitives: one-time state, Access verification, cookies

**Files:**
- Create: `src/auth/types.ts`, `src/auth/encoding.ts`, `src/auth/onceStore.ts`, `src/auth/access.ts`, `src/auth/cookies.ts`, `tests/authFixtures.ts`, `tests/access.test.ts`, `tests/cookies.test.ts`

**Interfaces:**
- Consumes: `type AccessSettings` (Task 1).
- Produces:
  - `type AuthProps = { sub: string; email: string; name: string; clientId: string; clientName: string }`, `isAuthProps(value: unknown): value is AuthProps`.
  - `toBase64Url(input: ArrayBuffer | Uint8Array): string`, `fromBase64Url(value: string): Uint8Array<ArrayBuffer>`.
  - `ONCE_TTL_SECONDS = 600`, `putOnce<T>(kv: KVNamespace, prefix: string, value: T, ttlSeconds?: number): Promise<string>`, `takeOnce<T>(kv: KVNamespace, prefix: string, id: string | null | undefined): Promise<T | null>`.
  - `type FetchLike = (input: string, init?: RequestInit) => Promise<Response>`, `class AccessError extends Error`, `pkcePair(): Promise<{ verifier: string; challenge: string }>`, `accessAuthorizeUrl(settings: AccessSettings, params: { redirectUri: string; state: string; challenge: string }): string`, `type UpstreamState = { oauthRequest: AuthRequest; codeVerifier: string }`, `exchangeCode(fetchFn: FetchLike, settings: AccessSettings, params: { code: string; codeVerifier: string; redirectUri: string }): Promise<string>`, `type IdentityClaims = { sub: string; email: string; name: string }`, `verifyIdToken(fetchFn: FetchLike, settings: AccessSettings, idToken: string, nowSeconds: number): Promise<IdentityClaims>`.
  - `APPROVED_COOKIE`, `CSRF_COOKIE`, `CLEAR_CSRF_COOKIE`, `sign(secret: string, value: string): Promise<string>`, `verify(secret: string, signed: string | null | undefined): Promise<string | null>`, `readCookie(request: Request, name: string): string | null`, `approvedClients(request: Request, secret: string): Promise<string[]>`, `approvedClientsCookie(request: Request, secret: string, clientId: string): Promise<string>`, `newCsrfToken(): { token: string; cookie: string }`, `csrfMatches(request: Request, formToken: FormDataEntryValue | null): boolean`.
  - Test fixtures: `TEST_SETTINGS`, `testSigningKey(kid?: string)`, `signJwt(privateKey: CryptoKey, header: object, payload: object): Promise<string>`, `fakeFetch(routes: Record<string, (init?: RequestInit) => Response>)`.

- [ ] **Step 1: Create `src/auth/types.ts` and `src/auth/encoding.ts`**

`src/auth/types.ts`:

```ts
/** Identity carried inside Worker-issued tokens. Never holds tokens or secrets. */
export type AuthProps = {
  sub: string;
  email: string;
  name: string;
  clientId: string;
  clientName: string;
};

export function isAuthProps(value: unknown): value is AuthProps {
  if (typeof value !== "object" || value === null) return false;
  const props = value as Record<string, unknown>;
  return (
    typeof props.sub === "string" &&
    props.sub !== "" &&
    typeof props.email === "string" &&
    props.email.includes("@") &&
    typeof props.name === "string" &&
    typeof props.clientId === "string" &&
    props.clientId !== "" &&
    typeof props.clientName === "string"
  );
}
```

`src/auth/encoding.ts`:

```ts
export function toBase64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("invalid base64url");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
```

- [ ] **Step 2: Create `tests/authFixtures.ts`**

```ts
import type { AccessSettings } from "../src/config";
import type { FetchLike } from "../src/auth/access";
import { toBase64Url } from "../src/auth/encoding";

const BASE = "https://team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/test-client";

export const TEST_SETTINGS: AccessSettings = {
  clientId: "test-client",
  clientSecret: ["test", "client", "secret"].join("-"),
  authorizationUrl: `${BASE}/authorization`,
  tokenUrl: `${BASE}/token`,
  jwksUrl: `${BASE}/jwks`,
  issuer: BASE,
  cookieKey: "c".repeat(64),
};

/** A fresh RSA signing key and matching JWKS, generated per test run. */
export async function testSigningKey(kid = "test-key") {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { kid, privateKey: pair.privateKey, jwks: { keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] } };
}

export async function signJwt(privateKey: CryptoKey, header: object, payload: object): Promise<string> {
  const encode = (value: object) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(signature)}`;
}

export type FetchCall = { url: string; init?: RequestInit };

/** An offline fetch that answers only the routes it was given and records every call. */
export function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: FetchCall[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch to ${url}`);
    return route(init);
  };
  return { fetch: fn, calls };
}

export function idClaims(nowSeconds: number, overrides: Record<string, unknown> = {}) {
  return {
    iss: TEST_SETTINGS.issuer,
    aud: TEST_SETTINGS.clientId,
    sub: "access-user-123",
    email: "Alice@Example.com",
    name: "Alice Analyst",
    iat: nowSeconds,
    exp: nowSeconds + 600,
    ...overrides,
  };
}
```

- [ ] **Step 3: Write the failing tests**

`tests/access.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  AccessError,
  accessAuthorizeUrl,
  exchangeCode,
  pkcePair,
  verifyIdToken,
} from "../src/auth/access";
import { toBase64Url } from "../src/auth/encoding";
import { putOnce, takeOnce } from "../src/auth/onceStore";
import { fakeFetch, idClaims, signJwt, TEST_SETTINGS, testSigningKey } from "./authFixtures";

const NOW = 1_789_000_000;

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AccessError) return err.message;
    throw err;
  }
  throw new Error("expected an AccessError");
}

describe("pkcePair", () => {
  it("derives an S256 challenge from a 43-character verifier", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    expect(challenge).toBe(toBase64Url(digest));
  });
});

describe("accessAuthorizeUrl", () => {
  it("sends the user to Access with PKCE and the OIDC scopes", () => {
    const url = new URL(
      accessAuthorizeUrl(TEST_SETTINGS, {
        redirectUri: "https://memory.example.com/callback",
        state: "state-token",
        challenge: "challenge-value",
      }),
    );
    expect(url.origin + url.pathname).toBe(TEST_SETTINGS.authorizationUrl);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "test-client",
      redirect_uri: "https://memory.example.com/callback",
      scope: "openid email profile",
      state: "state-token",
      code_challenge: "challenge-value",
      code_challenge_method: "S256",
    });
  });
});

describe("exchangeCode", () => {
  it("posts the code with PKCE and client credentials and returns the ID token", async () => {
    const fake = fakeFetch({
      [TEST_SETTINGS.tokenUrl]: () => Response.json({ id_token: "header.payload.signature" }),
    });
    const idToken = await exchangeCode(fake.fetch, TEST_SETTINGS, {
      code: "auth-code",
      codeVerifier: "verifier",
      redirectUri: "https://memory.example.com/callback",
    });
    expect(idToken).toBe("header.payload.signature");
    const body = new URLSearchParams(String(fake.calls[0]?.init?.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      client_id: "test-client",
      client_secret: TEST_SETTINGS.clientSecret,
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: "https://memory.example.com/callback",
    });
  });

  it("fails clearly on errors without exposing the response", async () => {
    const params = { code: "c", codeVerifier: "v", redirectUri: "https://m.example.com/callback" };
    const denied = fakeFetch({ [TEST_SETTINGS.tokenUrl]: () => new Response("nope", { status: 401 }) });
    expect(await rejection(exchangeCode(denied.fetch, TEST_SETTINGS, params))).toContain("returned 401");
    const empty = fakeFetch({ [TEST_SETTINGS.tokenUrl]: () => Response.json({}) });
    expect(await rejection(exchangeCode(empty.fetch, TEST_SETTINGS, params))).toContain("no id_token");
    const offline = fakeFetch({});
    expect(await rejection(exchangeCode(offline.fetch, TEST_SETTINGS, params))).toContain("could not reach");
    expect(await rejection(exchangeCode(offline.fetch, TEST_SETTINGS, { ...params, code: "" }))).toContain(
      "no code",
    );
  });
});

describe("verifyIdToken", () => {
  async function setup() {
    const key = await testSigningKey();
    const fake = fakeFetch({ [TEST_SETTINGS.jwksUrl]: () => Response.json(key.jwks) });
    const token = (payload: object, header: object = { alg: "RS256", kid: key.kid }) =>
      signJwt(key.privateKey, header, payload);
    return { key, fake, token };
  }

  it("returns the identity for a valid token", async () => {
    const { fake, token } = await setup();
    const claims = await verifyIdToken(fake.fetch, TEST_SETTINGS, await token(idClaims(NOW)), NOW);
    expect(claims).toEqual({ sub: "access-user-123", email: "alice@example.com", name: "Alice Analyst" });
  });

  it("accepts an audience array that includes the client id", async () => {
    const { fake, token } = await setup();
    const jwt = await token(idClaims(NOW, { aud: ["other", TEST_SETTINGS.clientId] }));
    await expect(verifyIdToken(fake.fetch, TEST_SETTINGS, jwt, NOW)).resolves.toMatchObject({
      sub: "access-user-123",
    });
  });

  it("rejects the wrong audience, issuer, expiry and issue time", async () => {
    const { fake, token } = await setup();
    const check = async (overrides: Record<string, unknown>) =>
      rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, await token(idClaims(NOW, overrides)), NOW));
    expect(await check({ aud: "someone-else" })).toContain("audience");
    expect(await check({ iss: "https://evil.example" })).toContain("issuer");
    expect(await check({ exp: NOW - 120 })).toContain("expired");
    expect(await check({ iat: NOW + 3600 })).toContain("future");
    expect(await check({ email: undefined })).toContain("no email");
    expect(await check({ sub: "" })).toContain("no subject");
  });

  it("rejects tokens signed by another key or with another algorithm", async () => {
    const { fake, key, token } = await setup();
    const other = await testSigningKey(key.kid);
    const forged = await signJwt(other.privateKey, { alg: "RS256", kid: key.kid }, idClaims(NOW));
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, forged, NOW))).toContain("signature");
    const hs = await token(idClaims(NOW), { alg: "HS256", kid: key.kid });
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, hs, NOW))).toContain("RS256");
    const unknownKid = await token(idClaims(NOW), { alg: "RS256", kid: "unknown" });
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, unknownKid, NOW))).toContain(
      "unknown key",
    );
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, "not-a-jwt", NOW))).toContain(
      "malformed",
    );
  });

  it("fails when the signing keys cannot be loaded", async () => {
    const { token } = await setup();
    const offline = fakeFetch({ [TEST_SETTINGS.jwksUrl]: () => new Response("down", { status: 503 }) });
    const jwt = await token(idClaims(NOW));
    expect(await rejection(verifyIdToken(offline.fetch, TEST_SETTINGS, jwt, NOW))).toContain("signing keys");
  });
});

describe("onceStore", () => {
  it("returns a stored value exactly once", async () => {
    const id = await putOnce(env.OAUTH_KV, "test", { hello: "world" });
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await takeOnce(env.OAUTH_KV, "test", id)).toEqual({ hello: "world" });
    expect(await takeOnce(env.OAUTH_KV, "test", id)).toBeNull();
  });

  it("ignores missing or malformed ids", async () => {
    expect(await takeOnce(env.OAUTH_KV, "test", null)).toBeNull();
    expect(await takeOnce(env.OAUTH_KV, "test", "../../etc")).toBeNull();
  });
});
```

`tests/cookies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  APPROVED_COOKIE,
  approvedClients,
  approvedClientsCookie,
  CSRF_COOKIE,
  csrfMatches,
  newCsrfToken,
  readCookie,
  sign,
  verify,
} from "../src/auth/cookies";

const SECRET = "s".repeat(64);

function withCookie(cookie: string): Request {
  return new Request("https://memory.example.com/authorize", { headers: { cookie } });
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

describe("sign and verify", () => {
  it("round-trips a value", async () => {
    expect(await verify(SECRET, await sign(SECRET, "hello"))).toBe("hello");
  });

  it("rejects tampering, the wrong secret and malformed input", async () => {
    const signed = await sign(SECRET, "hello");
    const [, signature] = signed.split(".");
    const forgedPayload = `${btoa("goodbye").replace(/=+$/, "")}.${signature}`;
    expect(await verify(SECRET, forgedPayload)).toBeNull();
    expect(await verify("x".repeat(64), signed)).toBeNull();
    expect(await verify(SECRET, "no-dot")).toBeNull();
    expect(await verify(SECRET, null)).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie(withCookie("a=1; b=two=2; c=3"), "b")).toBe("two=2");
    expect(readCookie(withCookie("a=1"), "missing")).toBeNull();
  });
});

describe("approved clients cookie", () => {
  it("is host-only, secure, HTTP-only and lax", async () => {
    const cookie = await approvedClientsCookie(withCookie(""), SECRET, "client-1");
    expect(cookie.startsWith(`${APPROVED_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("accumulates unique client ids and keeps the latest 20", async () => {
    let cookie = "";
    for (let i = 0; i < 22; i++) {
      cookie = cookieValue(await approvedClientsCookie(withCookie(cookie), SECRET, `client-${i}`));
    }
    cookie = cookieValue(await approvedClientsCookie(withCookie(cookie), SECRET, "client-21"));
    const ids = await approvedClients(withCookie(cookie), SECRET);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("client-2");
    expect(ids.at(-1)).toBe("client-21");
  });

  it("ignores a cookie signed with another secret", async () => {
    const cookie = cookieValue(await approvedClientsCookie(withCookie(""), "y".repeat(64), "client-1"));
    expect(await approvedClients(withCookie(cookie), SECRET)).toEqual([]);
  });
});

describe("CSRF", () => {
  it("matches only when the form token equals the cookie token", () => {
    const { token, cookie } = newCsrfToken();
    expect(cookie.startsWith(`${CSRF_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("SameSite=Strict");
    const request = withCookie(cookieValue(cookie));
    expect(csrfMatches(request, token)).toBe(true);
    expect(csrfMatches(request, `${token.slice(0, -1)}x`)).toBe(false);
    expect(csrfMatches(request, null)).toBe(false);
    expect(csrfMatches(withCookie(""), token)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/access.test.ts tests/cookies.test.ts`
Expected: FAIL, cannot find modules `../src/auth/access`, `../src/auth/onceStore` and `../src/auth/cookies`.

- [ ] **Step 5: Create `src/auth/onceStore.ts`**

```ts
import { toBase64Url } from "./encoding";

export const ONCE_TTL_SECONDS = 600;
const ID = /^[A-Za-z0-9_-]{43}$/;

/** Stores a value under a random 256-bit id for a short time. */
export async function putOnce<T>(
  kv: KVNamespace,
  prefix: string,
  value: T,
  ttlSeconds = ONCE_TTL_SECONDS,
): Promise<string> {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  await kv.put(`${prefix}:${id}`, JSON.stringify(value), { expirationTtl: ttlSeconds });
  return id;
}

/**
 * Reads and deletes a stored value. KV is eventually consistent, so this is a
 * best-effort single use; the OAuth provider's own authorization codes remain
 * strictly single use.
 */
export async function takeOnce<T>(
  kv: KVNamespace,
  prefix: string,
  id: string | null | undefined,
): Promise<T | null> {
  if (!id || !ID.test(id)) return null;
  const key = `${prefix}:${id}`;
  const raw = await kv.get(key);
  if (raw === null) return null;
  await kv.delete(key);
  return JSON.parse(raw) as T;
}
```

- [ ] **Step 6: Create `src/auth/access.ts`**

```ts
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { AccessSettings } from "../config";
import { fromBase64Url, toBase64Url } from "./encoding";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A sign-in failure whose message is safe to show; it never includes tokens or secrets. */
export class AccessError extends Error {
  constructor(detail: string) {
    super(`Access sign-in failed: ${detail}`);
    this.name = "AccessError";
  }
}

export type UpstreamState = { oauthRequest: AuthRequest; codeVerifier: string };
export type IdentityClaims = { sub: string; email: string; name: string };

const CLOCK_SKEW_SECONDS = 60;

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(digest) };
}

export function accessAuthorizeUrl(
  settings: AccessSettings,
  params: { redirectUri: string; state: string; challenge: string },
): string {
  const url = new URL(settings.authorizationUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: settings.clientId,
    redirect_uri: params.redirectUri,
    scope: "openid email profile",
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeCode(
  fetchFn: FetchLike,
  settings: AccessSettings,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<string> {
  if (!params.code) {
    throw new AccessError("the sign-in response had no code");
  }
  let response: Response;
  try {
    response = await fetchFn(settings.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code: params.code,
        code_verifier: params.codeVerifier,
        redirect_uri: params.redirectUri,
      }).toString(),
    });
  } catch {
    throw new AccessError("could not reach the Access token endpoint");
  }
  if (!response.ok) {
    throw new AccessError(`the Access token endpoint returned ${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!body || typeof body.id_token !== "string") {
    throw new AccessError("the Access token response had no id_token");
  }
  return body.id_token;
}

function decodePart(part: string): Record<string, unknown> {
  try {
    const value = JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
    if (typeof value !== "object" || value === null) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AccessError("the ID token is malformed");
  }
}

async function signingKey(fetchFn: FetchLike, settings: AccessSettings, kid: string): Promise<CryptoKey> {
  let jwks: { keys?: (JsonWebKey & { kid?: string })[] };
  try {
    const response = await fetchFn(settings.jwksUrl, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`status ${response.status}`);
    jwks = (await response.json()) as typeof jwks;
  } catch {
    throw new AccessError("could not load the Access signing keys");
  }
  const jwk = jwks.keys?.find((key) => key.kid === kid && key.kty === "RSA");
  if (!jwk) {
    throw new AccessError("the ID token was signed by an unknown key");
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function verifyIdToken(
  fetchFn: FetchLike,
  settings: AccessSettings,
  idToken: string,
  nowSeconds: number,
): Promise<IdentityClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new AccessError("the ID token is malformed");
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodePart(headerPart);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new AccessError("the ID token must be RS256 with a key id");
  }

  const key = await signingKey(fetchFn, settings, header.kid);
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = fromBase64Url(signaturePart);
  } catch {
    throw new AccessError("the ID token is malformed");
  }
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) {
    throw new AccessError("the ID token signature is invalid");
  }

  const claims = decodePart(payloadPart);
  if (claims.iss !== settings.issuer) {
    throw new AccessError("the ID token issuer does not match this Access app");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(settings.clientId)) {
    throw new AccessError("the ID token audience does not match this Access app");
  }
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds) {
    throw new AccessError("the ID token has expired");
  }
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new AccessError("the ID token was issued in the future");
  }
  if (typeof claims.sub !== "string" || claims.sub === "") {
    throw new AccessError("the ID token has no subject");
  }
  if (typeof claims.email !== "string" || !claims.email.includes("@")) {
    throw new AccessError("the ID token has no email; enable the email scope on the Access app");
  }
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : "",
  };
}
```

- [ ] **Step 7: Create `src/auth/cookies.ts`**

```ts
import { fromBase64Url, toBase64Url } from "./encoding";

export const APPROVED_COOKIE = "__Host-kd_approved";
export const CSRF_COOKIE = "__Host-kd_csrf";
export const CLEAR_CSRF_COOKIE = `${CSRF_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

const APPROVED_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_APPROVED_CLIENTS = 20;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function sign(secret: string, value: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(value));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the signed value, or null when it is missing, malformed or forged. */
export async function verify(secret: string, signed: string | null | undefined): Promise<string | null> {
  if (!signed) return null;
  const [payload, signature, extra] = signed.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    return valid ? new TextDecoder().decode(fromBase64Url(payload)) : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function approvedClients(request: Request, secret: string): Promise<string[]> {
  const value = await verify(secret, readCookie(request, APPROVED_COOKIE));
  if (!value) return [];
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function approvedClientsCookie(
  request: Request,
  secret: string,
  clientId: string,
): Promise<string> {
  const previous = (await approvedClients(request, secret)).filter((id) => id !== clientId);
  const ids = [...previous, clientId].slice(-MAX_APPROVED_CLIENTS);
  const value = await sign(secret, JSON.stringify(ids));
  return `${APPROVED_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${APPROVED_MAX_AGE_SECONDS}`;
}

export function newCsrfToken(): { token: string; cookie: string } {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return {
    token,
    cookie: `${CSRF_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`,
  };
}

export function csrfMatches(request: Request, formToken: FormDataEntryValue | null): boolean {
  const cookieToken = readCookie(request, CSRF_COOKIE);
  if (typeof formToken !== "string" || !cookieToken || formToken.length !== cookieToken.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < formToken.length; i++) {
    difference |= formToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }
  return difference === 0;
}
```

- [ ] **Step 8: Run tests, typecheck and lint**

Run: `npx vitest run tests/access.test.ts tests/cookies.test.ts && npm run typecheck && npm run lint`
Expected: 18 tests PASS; typecheck and lint exit 0 (run `npm run format` first if only formatting is reported).

- [ ] **Step 9: Live check of a real Access ID token** (needs an Access for SaaS app; blocks Task 4)

The checks above assume Access sets `iss` to the issuer URL, `aud` to the client id, and signs
with RS256 using a key id. Cloudflare's docs do not state this, and their own demo verifies only
the signature, so confirm it against a real application before Task 4 depends on it.

1. In Cloudflare One, create an **Access for SaaS** application with the **OIDC** protocol, redirect
   URL `http://localhost:8787/callback`, and the `openid`, `email` and `profile` scopes.
2. Read the public discovery document (no secrets involved):

```bash
ISSUER="https://<your-team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>"
curl -s "$ISSUER/.well-known/openid-configuration" | python3 -c 'import json,sys
d = json.load(sys.stdin)
keys = ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri", "id_token_signing_alg_values_supported", "scopes_supported"]
print(json.dumps({k: d.get(k) for k in keys}, indent=2))'
```

Expected: `issuer` equals `$ISSUER`, `id_token_signing_alg_values_supported` includes `RS256`,
and the endpoints match the values in `.dev.vars`.

3. If `issuer` is not the token URL without `/token`, set `ACCESS_ISSUER` in `.dev.vars` (Task 1
   supports it) instead of changing the verification code.
4. After the first real sign-in (Task 6), confirm the token's shape. This prints claim names and the
   issuer and audience only, never the token or its signature:

```bash
# Paste the ID token into JWT for this one check, then clear it.
read -rs JWT && export JWT && python3 -c 'import base64, json, os
parts = os.environ["JWT"].split(".")
pad = lambda s: s + "=" * (-len(s) % 4)
head = json.loads(base64.urlsafe_b64decode(pad(parts[0])))
body = json.loads(base64.urlsafe_b64decode(pad(parts[1])))
print(json.dumps({"alg": head.get("alg"), "kid_present": bool(head.get("kid")), "iss": body.get("iss"),
                  "aud": body.get("aud"), "email_present": bool(body.get("email")),
                  "sub_present": bool(body.get("sub"))}, indent=2))'; unset JWT
```

Expected: `alg` is `RS256`, `kid_present` is true, `iss` matches the configured issuer, `aud` is the
client id, and both `email_present` and `sub_present` are true. Record the result in the spec's
section 14 table.

- [ ] **Step 10: Commit** (the gitleaks pre-commit hook must pass)

```bash
git add src/auth/types.ts src/auth/encoding.ts src/auth/onceStore.ts src/auth/access.ts src/auth/cookies.ts tests/authFixtures.ts tests/access.test.ts tests/cookies.test.ts
git commit -m "Add Access sign-in primitives: PKCE, ID token verification, one-time state and signed cookies"
```

<!-- PLAN CONTINUES -->
