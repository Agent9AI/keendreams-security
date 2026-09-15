# KeenDreams Security Memory: Design

- **Date:** 2026-09-15
- **Status:** Design approved section by section, including the business layer (section 15)
- **Repo:** `Agent9AI/keendreams-security` (MIT)
- **Listing target:** Tenable CyberAgents Exchange, MCP server listing

## 1. Purpose

An open-source memory layer for custom security systems. It gives security agents
and analysts a shared, evidence-backed knowledge graph that remembers findings,
triage decisions, exceptions and investigations across runs and sessions.

**Users**

| Id | User | Need |
|----|------|------|
| A | Teams building security agents and automations | Memory across runs: past findings, verdicts, false positives, accepted-risk exceptions |
| B | Security analysts in Claude Code | Investigations and decisions remembered and searchable |
| C | MSSPs and consultants | Strict per-client separation, switched on from the admin page |

**Non-goals for v1:** SIEM or log storage, bulk scanner sync, cross-client
queries, surprise scoring and pattern analytics from the original KeenDreams,
GitHub login, MCP resources and prompts.

## 2. Principles

1. **The deployer owns everything.** Each deployer runs their own copy in their
   own Cloudflare account via Deploy to Cloudflare. The project authors run no
   service and receive no data.
2. **No keys.** No credentials in the repo or its history. No third-party AI
   API keys (all AI runs on Workers AI bindings). No static shared secret for
   MCP clients (OAuth only). The only secrets are the deployer's own identity
   settings, created in their own account.
3. **Evidence first.** Every fact cites the episode (raw evidence) it came from.
4. **Anyone proposes, only a human in a browser confirms.** No MCP call can make
   a fact trusted, except writes from a source identity an admin explicitly
   allowlisted.
5. **Nothing is edited or deleted.** Changes close old facts and add new ones,
   so past states stay queryable.

## 3. Deployment model

The README "Deploy to Cloudflare" button copies the public repo into the
deployer's GitHub account and creates, in the deployer's Cloudflare account:

| Binding | Type | Purpose |
|---------|------|---------|
| `CLIENT_MEMORY` | Durable Object (SQLite) | One database per client |
| `REGISTRY` | Durable Object (SQLite) | Mode, clients, members, allowlists, limits |
| `VECTORS` | Vectorize index (768 dims, cosine) | Semantic search, one namespace per client |
| `AI` | Workers AI | Embeddings and fact suggestions |
| `OAUTH_KV` | KV namespace | OAuth provider grant and token storage |

The button prompts for settings named in `.dev.vars.example` (names only, no
values in the repo):

```
ACCESS_CLIENT_ID=
ACCESS_CLIENT_SECRET=
ACCESS_TOKEN_URL=
ACCESS_AUTHORIZATION_URL=
ACCESS_JWKS_URL=
COOKIE_ENCRYPTION_KEY=
ADMIN_EMAILS=
```

Each binding and setting has a plain-language description in `package.json`
under `cloudflare.bindings`, shown on the deploy screen.

**Deployer prerequisites:** a Cloudflare account and an Access for SaaS (OIDC)
application in their Cloudflare One dashboard. The Hexa recipe additionally
needs a Tenable One Foundation or Advanced license.

**Build-time check:** confirm the button creates the Vectorize index with the
configured dimensions. If it does not, the Worker creates the index on first
request and records that in `/admin`.

## 4. Architecture

```
MCP client (Claude Code, custom agents)
   |  OAuth 2.1 (deployer's Cloudflare Access for SaaS)
   v
Worker  src/worker.ts
   OAuthProvider  -> /authorize, /token, /oauth/register  (browser sign-in)
   createMcpHandler at /mcp  (Streamable HTTP)
   /review, /admin           (browser only, same sign-in)
   |
   |-- REGISTRY Durable Object       (who may use which client)
   |
   '-- CLIENT_MEMORY Durable Object "client:<slug>"
         SQLite: episodes, entities, facts, fact_evidence,
                 audit_log, fts, vector_queue, write_counters
         |
         '-- Vectorize namespace "<slug>"  (IDs only)
```

| Unit | Single responsibility |
|------|-----------------------|
| `src/worker.ts` | Routing: OAuth provider, MCP endpoint, browser pages |
| `src/auth/` | Access for SaaS upstream flow, consent screen, session cookie |
| `src/mcp/` | Tool definitions: validate input, resolve client via Registry, call the client's Durable Object. No business logic |
| `src/registry/` | `Registry` Durable Object: mode, clients, members, roles, allowlist, limits |
| `src/memory/` | `ClientMemory` Durable Object: schema, all writes, graph and history queries. The only code that changes memory data |
| `src/memory/keys.ts` | Canonical key parsing and normalization |
| `src/policy/` | Pure functions: initial fact status, supersession rules, who may confirm |
| `src/search/` | Embeddings, vector queue drain, recall ranking |
| `src/web/` | Server-rendered `/review` and `/admin` pages |
| `SKILL.md` | Hexa recipe skill for Claude Code (repo root) |

Files stay under 500 lines; a file approaching that is split along the unit
boundaries above.

## 5. Data model

### 5.1 ClientMemory (one SQLite database per client)

```sql
episodes(
  id TEXT PRIMARY KEY, content TEXT,            -- <= 256 KB after redaction
  source TEXT,                                  -- caller-declared, e.g. tenable-hexa
  principal_email TEXT, oauth_client_id TEXT, oauth_client_name TEXT,
  content_hash TEXT UNIQUE,                     -- sha256, dedupe
  redactions INTEGER, flags TEXT,               -- JSON, e.g. ["instruction_like"]
  part_of TEXT, part_index INTEGER,             -- chunking for large payloads
  observed_at TEXT, recorded_at TEXT)

entities(
  id TEXT PRIMARY KEY, kind TEXT, canonical_key TEXT UNIQUE,
  display_name TEXT, attributes TEXT, created_at TEXT)

facts(
  id TEXT PRIMARY KEY,
  subject_id TEXT, predicate TEXT, object_id TEXT,
  attributes TEXT,                              -- JSON: reason
  evidence_episode_id TEXT NOT NULL,            -- first evidence
  status TEXT,                  -- proposed | trusted | rejected | superseded
  origin TEXT,                  -- mcp | allowlisted_source | ai_suggestion
  proposed_by TEXT, suggested_by_model TEXT,
  valid_from TEXT, valid_to TEXT,               -- world time; supersession never edits these
  recorded_at TEXT, last_seen_at TEXT,          -- system time
  confirmed_by TEXT, confirmed_at TEXT,
  rejected_by TEXT, rejected_at TEXT,
  decision_audit_seq INTEGER,                   -- audit row of confirm, reject or allowlisted trust
  superseded_by TEXT, superseded_at TEXT,
  superseded_audit_seq INTEGER)                 -- rollback uses both audit sequence columns

fact_evidence(fact_id TEXT, episode_id TEXT, added_at TEXT)  -- corroboration

audit_log(
  seq INTEGER PRIMARY KEY, at TEXT, actor TEXT, action TEXT,
  target TEXT, detail TEXT, prev_hash TEXT, row_hash TEXT)   -- append-only

fts USING fts5(kind, ref_id, text)  -- episodes, entity names, fact reasons
vector_queue(item_id TEXT, op TEXT, attempts INTEGER, next_at TEXT, last_error TEXT)
write_counters(principal TEXT, window_start TEXT, count INTEGER)
```

### 5.2 Registry (one per deployment)

```sql
settings(key TEXT PRIMARY KEY, value TEXT)    -- mode: single | multi
clients(slug TEXT PRIMARY KEY, name TEXT, created_at TEXT)
members(email TEXT, client_slug TEXT, role TEXT)  -- member | reviewer
source_allowlist(client_slug TEXT, principal TEXT, source TEXT, added_by TEXT)
limits(client_slug TEXT, writes_per_minute INTEGER)  -- default 120
```

Slugs match `^[a-z0-9-]{1,48}$`, which keeps Vectorize namespace names under
the 64-byte limit. Admins come only from `ADMIN_EMAILS` and are reviewers on
every client.

### 5.3 Canonical keys

Format `<kind>:<value>`, normalized in `src/memory/keys.ts`:

| Kind | Example | Normalization |
|------|---------|---------------|
| `asset` | `asset:web-prod-03` | lowercase, trimmed |
| `cve` | `cve:CVE-2026-1234` | uppercase, must match `CVE-\d{4}-\d{4,}` |
| `tenable-plugin` | `tenable-plugin:201455` | digits only |
| `identity` | `identity:j.doe@example.com` | lowercase |
| `agent` | `agent:triage-bot` | lowercase |
| `ioc-ip` / `ioc-domain` / `ioc-hash` | `ioc-domain:bad.example` | type-specific validation |
| `control` / `ticket` | `ticket:SEC-142` | trimmed |

New kinds are added in code with a test, not at runtime.

### 5.4 Relationship types and supersession

| Predicate | Subject -> Object | Rule |
|-----------|------------------|------|
| `HAS_VULN` | asset -> cve, tenable-plugin | New trusted `HAS_VULN` closes a current `REMEDIATED` for the same pair (regression) |
| `REMEDIATED` | asset -> cve, tenable-plugin | Closes current `HAS_VULN` and `ACCEPTED_RISK` for the same pair |
| `FALSE_POSITIVE` | asset -> cve, tenable-plugin | Closes current `HAS_VULN` for the same pair |
| `ACCEPTED_RISK` | asset -> cve, tenable-plugin | Requires `valid_to` (expiry) and a reason; expires by date, no job |
| `OWNS` | identity -> asset | none |
| `OBSERVED` | agent, identity -> asset, ioc-* | none |
| `RELATED_TO` | any -> any | none |

Re-asserting a proposed or trusted fact with the same subject, predicate, object
and `valid_to` adds a `fact_evidence` row and updates `last_seen_at` instead of
creating a new fact. If the existing fact is proposed and the new write comes from
an allowlisted source, the existing fact becomes trusted.

Every predicate also closes itself, so a trusted fact with a different validity
window (for example a renewed `ACCEPTED_RISK`) replaces the older one.
Supersession sets `superseded_at` and never edits `valid_to`. Proposed facts
close nothing until confirmed.

## 6. Trust and writes

### 6.1 Initial status (`src/policy/`)

| Write | Status |
|-------|--------|
| `assert_fact` through MCP, any signed-in user or agent, any role | `proposed` |
| `assert_fact` whose principal and declared `source` match the client's allowlist | `trusted` |
| `suggest_facts` output | `proposed`, always |

Reviewers make facts trusted only on `/review`. Callers cannot set status, and a
declared `source` never raises trust on its own. The allowlist exists for
structured automations (for example a scheduled sync identity) and is an
explicit admin decision per client.

### 6.2 Write steps (one Durable Object transaction)

1. Validate: canonical keys, predicate and kinds from 5.4, episode size, write limit.
2. Redact credential-like strings in episode content (AWS keys, tokens, private
   keys, bearer headers) and store the count. Flag instruction-like text as
   `instruction_like`. Flags inform reviewers and never raise trust.
3. Insert the episode, or return the existing one on a `content_hash` match.
   Payloads over 256 KB are split into linked parts; payloads over 4 MB are
   rejected with `too_large`.
4. Upsert entities by canonical key.
5. Insert the fact with its policy status, or add corroboration (5.4).
   Apply supersession only when the new fact is trusted.
6. Append the audit row (hash of the previous row plus this row).
7. Enqueue vector writes.

### 6.3 AI suggestions

`suggest_facts` sends one episode to a Workers AI model as data inside a fixed
prompt and requires structured JSON output. Every suggestion goes through the
same validation as `assert_fact` and is stored as `proposed` with
`suggested_by_model`. Invalid suggestions are dropped and counted in the response.

### 6.4 Review and rollback (`/review`, browser only)

- Lists proposed facts per client with evidence, flags, proposer and client name.
- Confirm or reject, singly or in bulk. Confirming applies supersession.
- Rollback to an audit sequence: every fact confirmed, rejected or trusted by an
  allowlisted source after it returns to `proposed`, and facts those decisions
  superseded are reopened. Rollback itself is an audit entry. Trust undone by a
  rollback counts as never granted when querying past dates.
- Pages use the OAuth sign-in session cookie with CSRF tokens on every form.

## 7. MCP tools

| Tool | Input (summary) | Output (summary) |
|------|-----------------|------------------|
| `record_episode` | client?, content, source, observed_at? | episode_id, redactions, flags, parts |
| `assert_fact` | client?, subject, predicate, object, evidence_episode_id, valid_from?, valid_to?, reason? | fact_id, status, superseded[] |
| `suggest_facts` | client?, episode_id | proposals[], dropped count |
| `find_facts` | client?, subject?, predicate?, object?, status?, as_of? | facts[] |
| `recall` | client?, query, as_of?, include_proposed? (false), limit? (10, max 25) | results[], search_mode |
| `get_entity` | client?, key | entity, current trusted facts, neighbors, pending_proposals |
| `explore_graph` | client?, key, depth? (1-3), predicates? | paths (max 200 edges) |
| `fact_history` | client?, fact_id or subject+predicate+object | timeline of validity, supersession, confirmation |
| `list_proposals` | client? | proposals[], review_url |

`client` is optional in single mode (defaults to `default`) and required in multi mode.

### 7.1 Recall

1. FTS5 BM25 over the client's `fts` table.
2. Embed the query (`@cf/baai/bge-base-en-v1.5`), query Vectorize top 100 IDs in
   the client's namespace.
3. Merge both lists with reciprocal rank fusion (k = 60).
4. Filter in SQLite: `trusted` (plus `proposed` when requested), valid at
   `as_of` (default now), not superseded.
5. Attach one hop of trusted facts around the top entities.
6. Return up to `limit` results. Each has status, validity window, confirmer,
   and an `evidence` object holding up to 500 characters of quoted episode text.

### 7.2 Output conventions

- Episode text only appears inside `evidence.quote`, never in summary fields.
- Proposed facts carry `"confidence_label": "UNCONFIRMED"`.
- If Vectorize or Workers AI is unavailable, recall runs steps 1, 4, 5 and 6
  and returns `search_mode: "keyword_only"`.

## 8. Sign-in and multiple clients

1. The MCP client calls `/mcp`, receives a 401 with protected-resource
   metadata, registers at `/oauth/register`, and opens `/authorize`.
2. The Worker redirects to the deployer's Access for SaaS app. The user signs
   in with the deployer's identity provider.
3. The Worker exchanges the code, verifies the ID token against
   `ACCESS_JWKS_URL`, and completes authorization with props
   `{ email, name, sub }`. The MCP client receives a Worker-issued token.
   The Access token is never passed to the MCP client.
4. A consent screen names the MCP client and its capabilities; approval is
   remembered in an encrypted cookie.
5. Tools read the principal with `getMcpAuthContext()`.

**Registry and modes**

- First admin visit to `/admin` asks: one team, or multiple clients. Stored as `mode`.
- Single mode: one client `default`; every signed-in user is a member. Who can
  sign in at all is governed by the deployer's Access policy.
- Multi mode: explicit membership per client. Every tool requires `client`, and
  the Worker checks membership in the Registry before opening
  `client:<slug>`. Vectorize calls always use that slug as the namespace.
- `/admin` manages mode, clients, members and reviewers, allowlists, write
  limits, failed vector items, audit-chain verification, and MCP client
  revocation (`OAuthHelpers.deleteClient()` revokes a client for all users).

## 9. Hexa recipe skill

`SKILL.md` at the repo root, `name: hexa-to-memory`, invoked as `/hexa-to-memory`.

1. Check that both MCP servers are connected. If Tenable Hexa is missing, show:
   `claude mcp add --transport http tenable-hexa https://cloud.tenable.com/mcp/ --header "X-ApiKeys: accessKey=<ACCESS_KEY>;secretKey=<SECRET_KEY>"`.
   Keys live only in the analyst's own Claude Code configuration.
2. Ask for a focused scope: asset, tag, CVE, severity, or time window.
3. Pull findings with Hexa read-only tools only. The skill never calls Hexa
   tools that launch, modify or delete anything. Tool names are taken from a
   live `tools/list` against a real Tenable One instance during the build.
4. Run `find_facts` for existing `ACCEPTED_RISK`, `FALSE_POSITIVE` and
   `REMEDIATED` facts on each asset and vulnerability pair.
5. Write one episode per batch with `source: tenable-hexa`, then `HAS_VULN`
   facts (trusted only when an admin allowlisted that identity and source).
6. Record analyst decisions as proposed facts and give the `/review` link.
7. Output a table: new findings, known findings, already triaged (with who,
   when, and expiry).

## 10. Error handling

- Tool errors return a stable code and a plain message:
  `invalid_input`, `forbidden_client`, `not_found`, `too_large`,
  `rate_limited`, `unavailable`. No stack traces, no other client's data.
- Input is validated at the MCP boundary before any Durable Object call.
- Vector queue: drained by a Durable Object alarm with exponential backoff; after
  5 attempts the item is marked failed and shown in `/admin` with a reindex action.
- Workers AI failure in `suggest_facts` returns `unavailable` with no partial writes.
- Write limit per principal per client (default 120 per minute) returns `rate_limited`.
- `/admin` "verify audit chain" reports the first row whose hash does not match.

## 11. Testing

- **Unit (Vitest):** policy table, supersession rules, canonical keys,
  redaction, reciprocal rank fusion, audit hashing.
- **Test fixtures:** fake credentials are assembled at runtime from fragments so
  no literal matches a secret-scanner rule anywhere in the repo.
- **Integration (`@cloudflare/vitest-pool-workers`):** real Worker and Durable
  Object SQLite in workerd; Vectorize and Workers AI replaced by test doubles.
- **Required scenarios:**
  - An instruction-like episode yields only proposed facts; an MCP token cannot confirm.
  - A member of client A receives `forbidden_client` on client B.
  - `REMEDIATED` closes `HAS_VULN`; a later trusted `HAS_VULN` closes `REMEDIATED`.
  - `as_of` returns the state at that date.
  - Audit tampering is detected; rollback restores the prior trusted set.
  - Vector outage returns `keyword_only` results.
- **End to end:** manual `wrangler deploy` while private; Deploy to Cloudflare
  button into a clean account after going public; Claude Code connection;
  Hexa recipe against a live Tenable One instance; browser checks of `/review`
  and `/admin` locally and on the deployed Worker.
- **CI (GitHub Actions, every push):** typecheck, lint, tests, and gitleaks over
  full git history.

## 12. CyberAgents Exchange compliance

**Repository:** public, personal account `Agent9AI`, MIT `LICENSE`,
`"license": "MIT"` in `package.json`, clean history from the first commit.

**README sections:** what it does; prerequisites; how to run (Deploy button,
manual `wrangler`, `claude mcp add --transport http <name> <worker-url>/mcp`);
outputs (tool result shapes); known limitations; data flows.

**Data flows table (README):**

| From | To | What |
|------|----|------|
| MCP client | Deployer's Worker | Tool calls over OAuth |
| Worker | Deployer's Workers AI | Episode and query text for embeddings and suggestions |
| Worker | Deployer's Vectorize | Embeddings and item IDs |
| Worker | Deployer's Cloudflare Access | OAuth code exchange and key discovery |
| Analyst's Claude Code (skill) | Tenable Hexa MCP | Read-only finding queries with the analyst's own keys |

No component sends data to the project authors.

**Listing** `mcp-servers/keendreams-security-memory.md`:

- `name: "KeenDreams Security Memory"`, `transport: "http"`, `runtime: "node"`,
  `auth_method: "oauth2"`.
- `tools_exposed`: the nine tools in section 7; `resources_exposed: []`, `prompts_exposed: []`.
- `compatible_clients`: only clients verified end to end (Claude Code at minimum).
- `integrations: ["Cloudflare", "Tenable", "Tenable Hexa AI MCP"]`, adding
  `Cloudflare` to `validator.py` in the same PR.
- `works_with_tenable_hexa_mcp: true` only after section 9 passes against a live
  Tenable One instance.
- `cta: "T1"` (the validator requires `works_with_tenable_hexa_mcp: true`).
- `domains: ["vulnerability-management", "ai-security"]` (1 to 2 values; the first is primary).
- One listing file per PR. The skill listing follows once the first merges (section 15.B).
- The submission builder detects MCP fields by string matching, so the README
  states transport, auth method and tools explicitly.

## 13. Launch sequence

1. Create the GitHub repo private. First commit: `LICENSE`, `.gitignore`, gitleaks CI.
2. Build from the implementation plan.
3. Verify with a manual deploy while private. Make the repo public, then verify
   the Deploy button and the Hexa recipe.
4. Pre-submission review (section 15.G); the owner reviews the result.
5. Run the CyberAgents Exchange submission builder. The owner accepts the
   Contribution Agreement; the PR is opened only with owner approval.

## 14. Build-time verifications

| Item | Fallback if not as expected |
|------|-----------------------------|
| Deploy button creates the Vectorize index with 768 dimensions | Worker creates the index on first request |
| OAuth provider per-user grant revocation | Revoke per MCP client only (`deleteClient`) |
| Hexa MCP read-only tool names | Captured from live `tools/list`; skill lists only confirmed read tools |
| Workers AI model reliably returns schema-valid JSON for `suggest_facts` | Try another model; ship `suggest_facts` disabled by default if none qualifies |
| Claude Desktop remote OAuth connection works | Omit Claude Desktop from `compatible_clients` |

## 15. Business layer

**Goal:** the listing sends qualified leads to Agent9.dev without bending exchange
rules or user trust.

### 15.A Offer and call to action

- **Offer:** an Agent9.dev deploy and integrate package. Agent9 deploys into the
  client's own Cloudflare account, configures Access for SaaS and reviewers,
  connects the Hexa recipe to the client's Tenable One, and trains analysts and
  reviewers.
- **One call to action** in the README, near the top and at the end, linking to a
  dedicated agent9.dev package page with
  `utm_source=github&utm_medium=readme&utm_campaign=keendreams-security`.
- **Listing bodies stay factual.** No sales copy on the exchange.
- **No telemetry.** No component makes any call to Agent9. Measurement uses UTM
  tags, GitHub traffic data and agent9.dev analytics.

### 15.B Listings

| Order | Type | File | Key fields |
|-------|------|------|------------|
| 1 | MCP server | `mcp-servers/keendreams-security-memory.md` | `works_with_tenable_hexa_mcp: true`, `cta: "T1"`, `domains: ["vulnerability-management", "ai-security"]` |
| 2 | Skill | `skills/keendreams-hexa-to-memory.md` | Same repo (root `SKILL.md`), same stars on a second leaderboard; opened after listing 1 merges |
| 3 | Playbook | `playbooks/…` | Later: Hexa AI MCP, KeenDreams memory and a triage agent in one chain |

With `cta: "T1"` the listing page shows a "Powered by Hexa AI" banner and a
"Request a Demo" link to Tenable One, which aligns the listing with Tenable's own
funnel. It is only set once the Hexa recipe passes against a live Tenable One
instance.

### 15.C Launch and star momentum

- Leaderboard rank is raw GitHub stars. "Rising" marks the top 20% by stars per day
  among listings 90 days old or younger, so promotion is front-loaded into the
  first weeks.
- The launch kit is ready before listing 1 merges: README hero image, a
  90-second demo video, LinkedIn and X posts, and a week-one list of people to ask
  for stars.
- After publishing, run the community promoter flow (Tenable intake form and
  recording studio). Copy follows Tenable brand rules: "Tenable One" and "Hexa AI"
  written exactly, never implying Tenable endorsement. No em-dashes in any copy.

### 15.D Two-minute evaluation

- `npm run demo` seeds a synthetic scenario on a local `wrangler dev`: fake assets
  and CVEs, an accepted risk that expires, and a memory-poisoning attempt that lands
  as proposed and flagged.
- Demo mode runs only when `DEMO_MODE=1` is set in `.dev.vars` **and** the request
  host is `localhost` or `127.0.0.1`. `wrangler.jsonc` never sets it, and a test
  proves a non-local request is refused.
- `/review` and `/admin` get a polished UI; the README shows screenshots and a
  short GIF.
- `docs/memory-poisoning-defense.md` maps each control to the OWASP ASI06 defense
  layers.

### 15.E Trust signals

`SECURITY.md` (disclosure policy), `docs/threat-model.md`, OpenSSF Scorecard
workflow and badge, CodeQL, Dependabot, CI and secret-scan badges, and tagged
releases.

### 15.F agent9.dev package page

Drafted in the agent9.dev CMS as a draft; the owner publishes it. No customer
names, logos, "trusted by" claims or timing numbers until they are real and
measured.

### 15.G Pre-submission review (Plan 6)

1. High-effort code review and a security review of the whole repo.
2. The community adversarial pre-submission quality review skill.
3. The exchange `validator.py` run locally against each listing file.
4. Deploy to Cloudflare button test in a fresh account.
5. Live Hexa recipe test against Tenable One.
6. Owner review; the owner decides on the official PR.

### 15.H Plan sequence

| Plan | Scope |
|------|-------|
| 1 | Memory core (done) |
| 2 | MCP server, OAuth sign-in with Access for SaaS, Registry |
| 3 | Search (FTS5 and Vectorize), vector queue, `suggest_facts` |
| 4 | `/review` and `/admin` UI, demo mode |
| 5 | Hexa recipe skill, README, Deploy button, trust signals, agent9.dev draft, launch kit |
| 6 | Pre-submission review |
