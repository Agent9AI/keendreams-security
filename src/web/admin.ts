import { messagePage } from "../auth/consent";
import { csrfMatches, newCsrfToken } from "../auth/cookies";
import type { Session } from "../auth/session";
import { type AppSettings, adminEmails } from "../config";
import { REGISTRY_NAME } from "../mcp/context";
import type { ChainCheck } from "../memory/audit";
import { memoryErrorCode } from "../memory/errors";
import type { AllowRule, ClientRow, MemberRow, Mode, ModeState } from "../registry/store";
import { isDemoMode } from "./demo";
import { type Check, runChecks } from "./health";
import { escapeHtml, htmlResponse, PAGE_STYLE } from "./html";

export type AdminEnv = Env & AppSettings;

/**
 * Demo mode runs offline, where Vectorize and Workers AI cannot answer. Probing
 * them would show rows as failing, which is true of the laptop and false of the
 * product, so the demo says plainly that these probes run on a deployment.
 */
const DEMO_CHECKS: Check[] = [
  { name: "Workers KV", state: "ok", detail: "Local simulation." },
  {
    name: "Vectorize",
    state: "absent",
    detail: "Demo mode is offline. On a deployment this row is a live probe of your index.",
  },
  {
    name: "Workers AI (embeddings)",
    state: "absent",
    detail: "Demo mode is offline. On a deployment this row embeds a probe string.",
  },
  {
    name: "Workers AI (suggestions)",
    state: "absent",
    detail: "Demo mode is offline. On a deployment this row asks your model for schema-valid JSON.",
  },
];

const ADMIN_STYLE = `${PAGE_STYLE}
  main { max-width: 56rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 0.6rem; color: #e8edf2;
       border-bottom: 1px solid #243040; padding-bottom: 0.4rem; }
  h2:first-of-type { margin-top: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 0.5rem 0 0.9rem; }
  th { text-align: left; color: #8ea0b2; font-weight: 500; font-size: 0.8rem;
       text-transform: uppercase; letter-spacing: 0.04em; padding: 0.4rem 0.5rem; }
  td { padding: 0.5rem; border-top: 1px solid #1c2733; vertical-align: top; color: #b9c6d4; }
  td.k { font-family: ui-monospace, monospace; color: #cfe3ff; white-space: nowrap; }
  .pill { border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem; white-space: nowrap; }
  .ok { background: #12301f; border: 1px solid #2f6f4f; color: #7fd6a8; }
  .bad { background: #3a1f24; border: 1px solid #7a2f3a; color: #ffb3bf; }
  .off { background: #232d38; border: 1px solid #38506b; color: #9fb3c8; }
  form.inline { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;
                margin: 0.4rem 0 1rem; }
  input, select { font: inherit; font-size: 0.9rem; background: #0d1319; color: #e8edf2;
                  border: 1px solid #2c3a4c; border-radius: 8px; padding: 0.45rem 0.6rem; }
  button { font-size: 0.9rem; padding: 0.45rem 0.9rem; }
  .banner { border-radius: 9px; padding: 0.6rem 0.9rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .good { background: #12301f; border: 1px solid #2f6f4f; color: #cdf3e0; }
  .warn { background: #3a1f24; border: 1px solid #7a2f3a; color: #ffd8de; }
  .head { display: flex; justify-content: space-between; align-items: baseline;
          gap: 1rem; flex-wrap: wrap; }
  .who { font-size: 0.9rem; color: #8ea0b2; }
`;

type AdminView = {
  session: Session;
  slug: string;
  mode: ModeState;
  clients: ClientRow[];
  members: MemberRow[];
  rules: AllowRule[];
  limit: number;
  chain: ChainCheck;
  registryChain: ChainCheck;
  queue: { pending: number; failed: number };
  checks: Awaited<ReturnType<typeof runChecks>>;
  csrfToken: string;
  csrfCookie: string;
  notice: string | null;
  problem: string | null;
};

function pill(state: "ok" | "failed" | "absent"): string {
  const cls = state === "ok" ? "ok" : state === "failed" ? "bad" : "off";
  const label = state === "ok" ? "working" : state === "failed" ? "failing" : "not set up";
  return `<span class="pill ${cls}">${label}</span>`;
}

function chainRow(label: string, check: ChainCheck): string {
  const body = check.ok
    ? `<span class="pill ok">intact</span> ${check.rows} entries verified`
    : `<span class="pill bad">broken</span> first mismatch at entry ${check.firstBadSeq}`;
  return `<tr><td class="k">${escapeHtml(label)}</td><td>${body}</td></tr>`;
}

function render(view: AdminView): Response {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(view.csrfToken)}">`;
  const slug = escapeHtml(view.slug);

  const health = view.checks
    .map(
      (c) =>
        `<tr><td class="k">${escapeHtml(c.name)}</td><td>${pill(c.state)}</td><td>${escapeHtml(c.detail)}</td></tr>`,
    )
    .join("\n");

  const clients = view.clients.length
    ? view.clients
        .map(
          (c) =>
            `<tr><td class="k">${escapeHtml(c.slug)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.createdAt.slice(0, 10))}</td></tr>`,
        )
        .join("\n")
    : `<tr><td colspan="3">Only the default client exists.</td></tr>`;

  const members = view.members.length
    ? view.members
        .map(
          (m) => `<tr><td class="k">${escapeHtml(m.email)}</td><td>${escapeHtml(m.role)}</td>
        <td><form method="post" class="inline">${csrf}
          <input type="hidden" name="email" value="${escapeHtml(m.email)}">
          <input type="hidden" name="client" value="${slug}">
          <button class="cancel" name="action" value="remove_member">Remove</button>
        </form></td></tr>`,
        )
        .join("\n")
    : `<tr><td colspan="3">Nobody is a member of <span class="target">${slug}</span> yet. Administrators can always review.</td></tr>`;

  const rules = view.rules.length
    ? view.rules
        .map(
          (r) => `<tr><td class="k">${escapeHtml(r.principalEmail)}</td>
        <td class="k">${escapeHtml(r.source)}</td>
        <td><form method="post" class="inline">${csrf}
          <input type="hidden" name="client" value="${slug}">
          <input type="hidden" name="email" value="${escapeHtml(r.principalEmail)}">
          <input type="hidden" name="oauth_client_id" value="${escapeHtml(r.oauthClientId)}">
          <input type="hidden" name="source" value="${escapeHtml(r.source)}">
          <button class="cancel" name="action" value="revoke_source">Revoke</button>
        </form></td></tr>`,
        )
        .join("\n")
    : `<tr><td colspan="3">No automation is trusted. Everything written over MCP arrives unconfirmed, which is the safe default.</td></tr>`;

  const notice = view.notice ? `<div class="banner good">${escapeHtml(view.notice)}</div>` : "";
  const problem = view.problem ? `<div class="banner warn">${escapeHtml(view.problem)}</div>` : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Administration</title>
<style>${ADMIN_STYLE}</style>
</head>
<body>
<main>
  <div class="head">
    <h1>Administration</h1>
    <span class="who">${escapeHtml(view.session.email)} &middot; client <span class="target">${slug}</span>
      &middot; <a href="/review?client=${encodeURIComponent(view.slug)}">review queue</a></span>
  </div>
  ${notice}${problem}

  <h2>Deployment health</h2>
  <p class="note">Each row is a live probe, not a reading of the configuration.</p>
  <table><tr><th>Binding</th><th>State</th><th>Detail</th></tr>${health}</table>

  <h2>Audit chain</h2>
  <p class="note">Every entry hashes the one before it, so a modified row stops the chain verifying.</p>
  <table><tr><th>Log</th><th>Result</th></tr>
    ${chainRow(`client:${view.slug}`, view.chain)}
    ${chainRow("registry", view.registryChain)}
  </table>

  <h2>Roll back a decision</h2>
  <p class="note">Returns every fact confirmed, rejected or auto-trusted after an entry to
  proposed, and reopens whatever those decisions superseded. The rollback is itself an audit entry.</p>
  <form method="post" class="inline">${csrf}
    <label for="to_seq">Roll back to entry</label>
    <input id="to_seq" name="to_seq" type="number" min="0" value="0" required>
    <button class="cancel" name="action" value="rollback">Roll back</button>
  </form>

  <h2>Search index</h2>
  <table><tr><th>Waiting</th><th>Given up</th></tr>
    <tr><td>${view.queue.pending}</td><td>${view.queue.failed}</td></tr>
  </table>
  <form method="post" class="inline">${csrf}
    <button class="approve" name="action" value="reindex">Retry failed items</button>
  </form>

  <h2>Clients</h2>
  <p class="note">Mode is <strong>${escapeHtml(view.mode.mode)}</strong>. In single mode every
  tool call uses <span class="target">default</span>; in multi mode callers name a client.</p>
  <table><tr><th>Slug</th><th>Name</th><th>Created</th></tr>${clients}</table>
  <form method="post" class="inline">${csrf}
    <input name="slug" placeholder="acme" required pattern="[a-z0-9-]{1,48}">
    <input name="name" placeholder="Acme Corp" required>
    <button class="approve" name="action" value="create_client">Add client</button>
    <select name="mode">
      <option value="single"${view.mode.mode === "single" ? " selected" : ""}>single</option>
      <option value="multi"${view.mode.mode === "multi" ? " selected" : ""}>multi</option>
    </select>
    <button class="cancel" name="action" value="set_mode">Set mode</button>
  </form>

  <h2>Who may use ${slug}</h2>
  <table><tr><th>Email</th><th>Role</th><th></th></tr>${members}</table>
  <form method="post" class="inline">${csrf}
    <input type="hidden" name="client" value="${slug}">
    <input name="email" type="email" placeholder="analyst@example.com" required>
    <select name="role"><option value="member">member</option><option value="reviewer">reviewer</option></select>
    <button class="approve" name="action" value="set_member">Add or update</button>
  </form>

  <h2>Trusted automation for ${slug}</h2>
  <p class="note">An identity writing from one named source, whose facts arrive already trusted.
  This is the only way anything skips human review, so add it deliberately.</p>
  <table><tr><th>Identity</th><th>Source</th><th></th></tr>${rules}</table>
  <form method="post" class="inline">${csrf}
    <input type="hidden" name="client" value="${slug}">
    <input name="email" type="email" placeholder="sync@example.com" required>
    <input name="oauth_client_id" placeholder="OAuth client id" required>
    <input name="source" placeholder="tenable-hexa" required>
    <button class="approve" name="action" value="allow_source">Trust</button>
  </form>

  <h2>Write limit</h2>
  <form method="post" class="inline">${csrf}
    <input type="hidden" name="client" value="${slug}">
    <input name="writes_per_minute" type="number" min="1" max="10000" value="${view.limit}" required>
    <span class="note">writes per minute, per principal</span>
    <button class="cancel" name="action" value="set_limit">Save</button>
  </form>
</main>
</body>
</html>`;
  return htmlResponse(html, { headers: { "set-cookie": view.csrfCookie } });
}

/** Applies one administrative action. Returns a sentence for the banner. */
async function applyAction(
  form: FormData,
  env: AdminEnv,
  session: Session,
  slug: string,
): Promise<string> {
  const registry = env.REGISTRY.getByName(REGISTRY_NAME);
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const client = text("client") || slug;
  const actor = session.email;

  switch (form.get("action")) {
    case "rollback": {
      const memory = env.CLIENT_MEMORY.getByName(`client:${client}`);
      const result = await memory.rollbackTo(actor, Number(text("to_seq")));
      return `Rolled back to entry ${result.toSeq}. ${result.reverted.length} decisions undone, ${result.reopened.length} facts reopened.`;
    }
    case "reindex": {
      const memory = env.CLIENT_MEMORY.getByName(`client:${client}`);
      return `Re-queued ${await memory.reindexFailed()} items for indexing.`;
    }
    case "create_client": {
      const created = await registry.createClient(actor, text("slug"), text("name"));
      return `Created client ${created.slug}.`;
    }
    case "set_mode": {
      const state = await registry.setMode(actor, text("mode") as Mode);
      return `Mode is now ${state.mode}.`;
    }
    case "set_member": {
      const row = await registry.setMember(
        actor,
        text("email"),
        client,
        text("role") as MemberRow["role"],
      );
      return `${row.email} is a ${row.role} of ${row.clientSlug}.`;
    }
    case "remove_member": {
      await registry.removeMember(actor, text("email"), client);
      return `Removed ${text("email")} from ${client}.`;
    }
    case "allow_source": {
      const rule = await registry.allowSource(actor, {
        clientSlug: client,
        principalEmail: text("email"),
        oauthClientId: text("oauth_client_id"),
        source: text("source"),
      });
      return `${rule.principalEmail} writing as ${rule.source} is now trusted for ${rule.clientSlug}.`;
    }
    case "revoke_source": {
      await registry.revokeSource(actor, {
        clientSlug: client,
        principalEmail: text("email"),
        oauthClientId: text("oauth_client_id"),
        source: text("source"),
      });
      return `Revoked trust for ${text("email")} writing as ${text("source")}.`;
    }
    case "set_limit": {
      const limit = await registry.setWriteLimit(actor, client, Number(text("writes_per_minute")));
      return `Write limit for ${client} is now ${limit} per minute.`;
    }
    default:
      throw new Error("unknown action");
  }
}

/**
 * The administration page. Restricted to the emails in ADMIN_EMAILS, because
 * everything here either grants trust or rewrites history.
 */
export async function adminResponse(
  request: Request,
  env: AdminEnv,
  session: Session,
): Promise<Response> {
  const url = new URL(request.url);
  const demo = isDemoMode(env, url);
  if (!demo && !adminEmails(env).has(session.email.toLowerCase())) {
    return messagePage(
      "Administrators only",
      "This page manages trust and history. Ask whoever holds ADMIN_EMAILS for this deployment.",
      403,
    );
  }

  const registry = env.REGISTRY.getByName(REGISTRY_NAME);
  const slug = url.searchParams.get("client")?.trim() || "default";
  const memory = env.CLIENT_MEMORY.getByName(`client:${slug}`);

  let notice: string | null = null;
  let problem: string | null = null;

  if (request.method === "POST") {
    const form = await request.formData();
    if (!csrfMatches(request, form.get("csrf"))) {
      return messagePage("This form expired", "Open the administration page again.", 403);
    }
    try {
      notice = await applyAction(form, env, session, slug);
    } catch (error) {
      const code = memoryErrorCode(error);
      problem =
        code === null
          ? "That action could not be completed. The Worker logs have the detail."
          : (error as Error).message;
    }
  }

  const [mode, clients, members, rules, limit, chain, registryChain, queue, checks] =
    await Promise.all([
      registry.modeState(),
      registry.listClients(),
      registry.listMembers(slug),
      registry.listAllowRules(slug),
      registry.writeLimit(slug),
      memory.verifyAuditChain(),
      registry.verifyAuditChain(),
      memory.queueStatus(),
      demo ? Promise.resolve(DEMO_CHECKS) : runChecks(env),
    ]);

  const csrf = newCsrfToken();
  return render({
    session,
    slug,
    mode,
    clients,
    members,
    rules,
    limit,
    chain,
    registryChain,
    queue,
    checks,
    csrfToken: csrf.token,
    csrfCookie: csrf.cookie,
    notice,
    problem,
  });
}
