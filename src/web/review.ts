import { messagePage } from "../auth/consent";
import { csrfMatches, newCsrfToken } from "../auth/cookies";
import type { Session } from "../auth/session";
import { type AppSettings, adminEmails } from "../config";
import { REGISTRY_NAME } from "../mcp/context";
import { memoryErrorCode } from "../memory/errors";
import type { ProposalView } from "../memory/queries";
import { canReview } from "../policy/trust";
import { isDemoMode, seedDemo } from "./demo";
import { escapeHtml, htmlResponse, PAGE_STYLE } from "./html";

export type ReviewEnv = Env & AppSettings;

const MAX_LISTED = 50;
const QUOTE_CHARS = 320;

function shorten(text: string, limit = QUOTE_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function when(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function proposalCard(proposal: ProposalView): string {
  const flags = proposal.evidence.flags
    .map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`)
    .join("");
  const model = proposal.suggestedByModel
    ? `<span class="flag model">suggested by ${escapeHtml(proposal.suggestedByModel)}</span>`
    : "";
  const reason = proposal.reason
    ? `<p class="reason">Reason given: ${escapeHtml(shorten(proposal.reason, 200))}</p>`
    : "";
  return `<li class="card">
  <p class="claim">
    <span class="key">${escapeHtml(proposal.subject)}</span>
    <span class="pred">${escapeHtml(proposal.predicate)}</span>
    <span class="key">${escapeHtml(proposal.object)}</span>
  </p>
  <p class="meta">Proposed by ${escapeHtml(proposal.proposedBy)} at ${escapeHtml(when(proposal.recordedAt))}
    <span class="badge">UNCONFIRMED</span>${flags}${model}</p>
  ${reason}
  <blockquote>
    <span class="src">${escapeHtml(proposal.evidence.source)}</span>
    ${escapeHtml(shorten(proposal.evidence.quote))}
  </blockquote>
  <div class="row">
    <button class="approve" type="submit" name="fact_id" value="${escapeHtml(proposal.id)}"
      formaction="/review?action=confirm">Confirm</button>
    <button class="cancel" type="submit" name="fact_id" value="${escapeHtml(proposal.id)}"
      formaction="/review?action=reject">Reject</button>
  </div>
</li>`;
}

const REVIEW_STYLE = `${PAGE_STYLE}
  main { max-width: 52rem; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem;
          flex-wrap: wrap; margin-bottom: 0.5rem; }
  .who { font-size: 0.9rem; color: #8ea0b2; }
  .demo { background: #3a2f12; border: 1px solid #6b5520; color: #f3e2b8; padding: 0.6rem 0.9rem;
          border-radius: 9px; margin-bottom: 1.25rem; font-size: 0.9rem; }
  ul.cards { list-style: none; margin: 0; padding: 0; }
  .card { background: #121a22; border: 1px solid #243040; border-radius: 12px;
          padding: 1rem 1.1rem; margin-bottom: 0.9rem; }
  .claim { margin: 0 0 0.35rem; font-size: 1.05rem; color: #e8edf2; }
  .key { font-family: ui-monospace, monospace; color: #cfe3ff; }
  .pred { font-family: ui-monospace, monospace; color: #ffca7a; margin: 0 0.35rem; }
  .meta { margin: 0 0 0.6rem; font-size: 0.85rem; color: #8ea0b2; }
  .badge { background: #4a3410; border: 1px solid #7a571a; color: #ffca7a; border-radius: 999px;
           padding: 0.05rem 0.55rem; font-size: 0.75rem; margin-left: 0.4rem; }
  .flag { background: #3a1f24; border: 1px solid #7a2f3a; color: #ffb3bf; border-radius: 999px;
          padding: 0.05rem 0.55rem; font-size: 0.75rem; margin-left: 0.4rem; }
  .model { background: #1f2c3a; border-color: #2f5a7a; color: #9fd0ff; }
  blockquote { margin: 0; padding: 0.7rem 0.9rem; background: #0d1319; border-left: 3px solid #2f4257;
               border-radius: 0 8px 8px 0; color: #b9c6d4; font-size: 0.9rem; }
  .src { display: block; font-family: ui-monospace, monospace; color: #7fd6a8; font-size: 0.78rem;
         margin-bottom: 0.3rem; }
  .reason { margin: 0 0 0.6rem; font-size: 0.9rem; color: #b9c6d4; }
  .row { margin-top: 0.9rem; }
  .empty { background: #121a22; border: 1px dashed #2c3a4c; border-radius: 12px; padding: 1.5rem;
           text-align: center; color: #8ea0b2; }
`;

type PageOptions = {
  slug: string;
  role: string;
  session: Session;
  proposals: ProposalView[];
  csrfToken: string;
  csrfCookie: string;
  demo: boolean;
  trustedCount: number;
};

function renderReview(options: PageOptions): Response {
  const cards = options.proposals.map(proposalCard).join("\n");
  const body =
    options.proposals.length === 0
      ? `<div class="empty"><p>Nothing is waiting for review.</p>
         <p class="note">Facts proposed over MCP appear here until a human confirms them.</p></div>`
      : `<form method="post"><input type="hidden" name="csrf" value="${escapeHtml(options.csrfToken)}">
         <ul class="cards">${cards}</ul></form>`;
  const demoBanner = options.demo
    ? `<div class="demo"><strong>Demo mode.</strong> This runs only on localhost, with sample
       evidence and a stand-in reviewer. Cloudflare Access sign-in is switched off here.</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review queue</title>
<style>${REVIEW_STYLE}</style>
</head>
<body>
<main>
  <div class="head">
    <h1>Review queue</h1>
    <span class="who">${escapeHtml(options.session.email)} &middot; ${escapeHtml(options.role)} &middot; client <span class="target">${escapeHtml(options.slug)}</span></span>
  </div>
  ${demoBanner}
  <p>${options.proposals.length} waiting, ${options.trustedCount} already confirmed.
  Confirming a fact is the only way it becomes trusted, and only from this page.</p>
  ${body}
  <p class="note">Every decision is written to an append-only audit log with the reviewer and the time.</p>
</main>
</body>
</html>`;
  return htmlResponse(html, { headers: { "set-cookie": options.csrfCookie } });
}

/**
 * The review queue. This is the only place a fact can become trusted: MCP tools
 * can propose but never confirm, so a poisoned or mistaken proposal cannot
 * promote itself without a person deciding here in a browser.
 */
export async function reviewResponse(
  request: Request,
  env: ReviewEnv,
  session: Session,
): Promise<Response> {
  const url = new URL(request.url);
  const demo = isDemoMode(env, url);
  const registry = env.REGISTRY.getByName(REGISTRY_NAME);
  const isAdmin = demo || adminEmails(env).has(session.email.toLowerCase());

  let slug: string;
  let role: string;
  try {
    const access = await registry.resolveAccess({
      email: session.email,
      isAdmin,
      client: url.searchParams.get("client") ?? undefined,
    });
    slug = access.slug;
    role = access.role;
  } catch (error) {
    const code = memoryErrorCode(error);
    if (code === "forbidden_client" || code === "not_found" || code === "invalid_input") {
      return messagePage(
        "No access to that client",
        "Ask an administrator to add you to it, or open the review page without a client.",
        403,
      );
    }
    throw error;
  }

  if (!canReview(role as "member" | "reviewer" | "admin", "browser")) {
    return messagePage(
      "You are not a reviewer",
      `You can read and propose facts for ${slug}, but only a reviewer can confirm them.`,
      403,
    );
  }

  const memory = env.CLIENT_MEMORY.getByName(`client:${slug}`);

  if (request.method === "POST") {
    const form = await request.formData();
    if (!csrfMatches(request, form.get("csrf"))) {
      return messagePage("This form expired", "Open the review page again.", 403);
    }
    const factId = form.get("fact_id");
    if (typeof factId !== "string" || factId === "") {
      return messagePage("Nothing to decide", "No proposal was selected.", 400);
    }
    const action = url.searchParams.get("action");
    try {
      if (action === "confirm") await memory.confirmFact(session.email, factId);
      else if (action === "reject") await memory.rejectFact(session.email, factId);
      else return messagePage("Unknown action", "Use the buttons on the review page.", 400);
    } catch (error) {
      const code = memoryErrorCode(error);
      if (code === null) throw error;
      return messagePage(
        "That proposal could not be decided",
        String((error as Error).message),
        409,
      );
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: `/review?client=${encodeURIComponent(slug)}`,
        "cache-control": "no-store",
      },
    });
  }

  if (demo) await seedDemo(memory);

  const proposals = await memory.listProposals(MAX_LISTED);
  const trusted = await memory.findFacts({ status: "trusted", limit: 200 });
  const csrf = newCsrfToken();
  return renderReview({
    slug,
    role,
    session,
    proposals,
    csrfToken: csrf.token,
    csrfCookie: csrf.cookie,
    demo,
    trustedCount: trusted.length,
  });
}
