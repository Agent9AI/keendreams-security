import type { IdentityClaims } from "../auth/access";
import { toBase64Url } from "../auth/encoding";
import type { AppSettings } from "../config";
import type { ClientMemory } from "../memory/ClientMemory";
import type { Principal } from "../memory/types";

/** The identity demo mode signs you in as. It exists only on localhost. */
export const DEMO_IDENTITY: IdentityClaims = {
  sub: "demo-user",
  email: "you@demo.local",
  name: "Demo Reviewer",
};

const DEMO_PRINCIPAL: Principal = {
  email: DEMO_IDENTITY.email,
  oauthClientId: "demo-client",
  oauthClientName: "Demo agent",
};

let demoKey: string | null = null;

/**
 * A cookie key for demo mode only. Generated at runtime, so no secret is ever
 * committed, and regenerated per isolate, so demo sessions never outlive it.
 * Workers forbid crypto in global scope, so this is built on first use.
 */
export function demoCookieKey(): string {
  if (demoKey === null) demoKey = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return demoKey;
}

/**
 * Demo mode needs two independent things to be true: the deployer asked for it,
 * and the request arrived on a loopback address. A deployed Worker never answers
 * on localhost, so DEMO_MODE left on by accident still cannot open a real
 * deployment to an unauthenticated stranger.
 */
export function isDemoMode(env: AppSettings, url: URL): boolean {
  if ((env.DEMO_MODE ?? "").trim().toLowerCase() !== "on") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

type SeedFact = {
  subject: string;
  predicate: string;
  object: string;
  reason?: string;
  confirm?: boolean;
};

const SEED_EVIDENCE = [
  {
    source: "tenable-hexa",
    content: [
      "Tenable plugin 201455: Apache Struts remote code execution on web-prod-03.",
      "Severity Critical, CVSS 9.8, first seen 2026-09-10, still present at last scan.",
      "Host web-prod-03 is internet facing and owned by the payments team.",
    ].join("\n"),
    facts: [
      { subject: "asset:web-prod-03", predicate: "HAS_VULN", object: "cve:CVE-2026-1234" },
      {
        subject: "identity:payments@demo.local",
        predicate: "OWNS",
        object: "asset:web-prod-03",
        confirm: true,
      },
    ] as SeedFact[],
  },
  {
    source: "analyst-note",
    content: [
      "Reviewed CVE-2026-0077 on db-prod-01 with the DBA team on 2026-09-12.",
      "The affected module is not loaded in our build, so this is a false positive.",
      "Agreed to revisit if the module is ever enabled.",
    ].join("\n"),
    facts: [
      {
        subject: "asset:db-prod-01",
        predicate: "FALSE_POSITIVE",
        object: "cve:CVE-2026-0077",
        reason: "The affected module is not loaded in our build. Confirmed with the DBA team.",
      },
    ] as SeedFact[],
  },
  {
    source: "ticket",
    content: [
      "Ticket SEC-142: patching window for web-prod-03 approved for 2026-09-20.",
      "Risk accepted until then because the service cannot take downtime before the release.",
    ].join("\n"),
    facts: [
      {
        subject: "cve:CVE-2026-1234",
        predicate: "RELATED_TO",
        object: "ticket:SEC-142",
      },
    ] as SeedFact[],
  },
];

/**
 * Fills an empty demo database so the review queue shows something real the
 * moment someone opens it. Runs only in demo mode, and only when the client has
 * no evidence yet, so it never writes twice.
 */
export async function seedDemo(memory: DurableObjectStub<ClientMemory>): Promise<boolean> {
  const existing = await memory.listProposals(1);
  if (existing.length > 0) return false;
  const found = await memory.findFacts({ status: "trusted", limit: 1 });
  if (found.length > 0) return false;

  for (const batch of SEED_EVIDENCE) {
    const episode = await memory.recordEpisode(DEMO_PRINCIPAL, {
      content: batch.content,
      source: batch.source,
    });
    for (const fact of batch.facts) {
      const result = await memory.assertFact(DEMO_PRINCIPAL, {
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        evidenceEpisodeId: episode.episodeId,
        reason: fact.reason,
      });
      if (fact.confirm) await memory.confirmFact(DEMO_IDENTITY.email, result.factId);
    }
  }
  return true;
}
