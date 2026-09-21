import { reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { type AuthEnv, createAuthHandler } from "../src/auth/handler";
import { sessionCookie } from "../src/auth/session";
import type { HealthEnv } from "../src/web/health";
import { runChecks } from "../src/web/health";
import { TEST_ENV_SETTINGS, TEST_SETTINGS } from "./authFixtures";
import { ALICE } from "./helpers";

afterEach(async () => {
  await reset();
});

const ORIGIN = "https://memory.example.com";
const NOW = Date.parse("2026-09-17T12:00:00.000Z");
const ADMIN = { sub: "admin-1", email: "admin@example.com", name: "Ada Admin" };
const ANALYST = { sub: "user-2", email: "analyst@example.com", name: "Ann Analyst" };

const handler = createAuthHandler({
  fetch: async () => {
    throw new Error("no network in these tests");
  },
  now: () => NOW,
});

function workerEnv(extra: Record<string, string> = {}): AuthEnv {
  return { ...env, ...TEST_ENV_SETTINGS, ...extra } as unknown as AuthEnv;
}

async function cookieFor(identity: typeof ADMIN): Promise<string> {
  return (await sessionCookie(TEST_SETTINGS.cookieKey, identity, NOW)).split(";")[0] ?? "";
}

/** Loads the admin page and returns what a browser needs to post a form back. */
async function openAdmin(identity = ADMIN) {
  const session = await cookieFor(identity);
  const response = await handler.fetch(
    new Request(`${ORIGIN}/admin`, { headers: { cookie: session } }),
    workerEnv(),
  );
  const html = await response.text();
  const csrfCookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? "";
  return { response, html, cookie: `${session}; ${csrfCookie}`, csrf };
}

async function post(fields: Record<string, string>) {
  const { cookie, csrf } = await openAdmin();
  const response = await handler.fetch(
    new Request(`${ORIGIN}/admin`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf, ...fields }),
    }),
    workerEnv(),
  );
  return { status: response.status, html: await response.text() };
}

describe("who may open the admin page", () => {
  it("sends an anonymous visitor to sign in", async () => {
    const response = await handler.fetch(new Request(`${ORIGIN}/admin`), workerEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get("location") ?? "").toContain(TEST_SETTINGS.authorizationUrl);
  });

  it("refuses a signed-in person who is not an administrator", async () => {
    const { response, html } = await openAdmin(ANALYST);
    expect(response.status).toBe(403);
    expect(html).toContain("Administrators only");
  });

  it("opens for an administrator and verifies both audit chains", async () => {
    const { response, html } = await openAdmin();
    expect(response.status).toBe(200);
    expect(html).toContain("Deployment health");
    expect(html.match(/intact/g)?.length).toBe(2);
  });

  it("refuses a form posted without the matching token", async () => {
    const session = await cookieFor(ADMIN);
    const response = await handler.fetch(
      new Request(`${ORIGIN}/admin`, {
        method: "POST",
        headers: { cookie: session, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrf: "forged", action: "set_mode", mode: "multi" }),
      }),
      workerEnv(),
    );
    expect(response.status).toBe(403);
  });
});

describe("what an administrator can change", () => {
  it("trusts an automation source and shows it", async () => {
    const result = await post({
      action: "allow_source",
      client: "default",
      email: "sync@example.com",
      oauth_client_id: "client-sync",
      source: "tenable-hexa",
    });
    expect(result.status).toBe(200);
    expect(result.html).toContain("is now trusted for default");
    expect(result.html).toContain("sync@example.com");
  });

  it("rolls back a confirmation to an earlier audit entry", async () => {
    const memory = env.CLIENT_MEMORY.getByName("client:default");
    const episode = await memory.recordEpisode(ALICE, { content: "scan output", source: "nessus" });
    const fact = await memory.assertFact(ALICE, {
      subject: "asset:web-prod-03",
      predicate: "HAS_VULN",
      object: "cve:CVE-2026-1234",
      evidenceEpisodeId: episode.episodeId,
    });
    await memory.confirmFact("admin@example.com", fact.factId);
    expect(await memory.findFacts({ status: "trusted" })).toHaveLength(1);

    const result = await post({ action: "rollback", to_seq: String(fact.auditSeq) });
    expect(result.html).toContain("1 decisions undone");
    expect(await memory.findFacts({ status: "trusted" })).toHaveLength(0);
    expect(await memory.findFacts({ status: "proposed" })).toHaveLength(1);
  });

  it("reports a bad value as a message, not a crash", async () => {
    const result = await post({ action: "create_client", slug: "Not A Slug", name: "x" });
    expect(result.status).toBe(200);
    expect(result.html).toContain("invalid_input:");
  });
});

describe("deployment health probes", () => {
  const fakeVectors = {
    query: async () => ({ matches: [], count: 0 }),
    upsert: async () => ({ ids: [], count: 0 }),
    deleteByIds: async () => ({ ids: [], count: 0 }),
  };

  function fakeAi(options: { dims?: number; reply?: string; fail?: boolean }) {
    return {
      run: async (model: string) => {
        if (options.fail) throw new Error("model unavailable");
        if (model.includes("bge")) {
          return { data: [new Array(options.dims ?? 768).fill(0.1)] };
        }
        return { response: options.reply ?? '{"facts": []}' };
      },
    };
  }

  const kv = { get: async () => null };

  it("reports every binding working when each one answers correctly", async () => {
    const checks = await runChecks({
      OAUTH_KV: kv,
      VECTORS: fakeVectors,
      AI: fakeAi({}),
    } as unknown as HealthEnv);
    expect(checks.map((c) => c.state)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("catches an embedding model whose size does not match the index", async () => {
    const checks = await runChecks({
      OAUTH_KV: kv,
      VECTORS: fakeVectors,
      AI: fakeAi({ dims: 384 }),
    } as unknown as HealthEnv);
    const embeddings = checks.find((c) => c.name === "Workers AI (embeddings)");
    expect(embeddings?.state).toBe("failed");
    expect(embeddings?.detail).toContain("384");
  });

  it("marks a model that ignores the schema as failing", async () => {
    const checks = await runChecks({
      OAUTH_KV: kv,
      VECTORS: fakeVectors,
      AI: fakeAi({ reply: '{"something": "else"}' }),
    } as unknown as HealthEnv);
    expect(checks.find((c) => c.name === "Workers AI (suggestions)")?.state).toBe("failed");
  });

  it("reports outages and missing bindings without throwing", async () => {
    const down = await runChecks({
      OAUTH_KV: kv,
      VECTORS: fakeVectors,
      AI: fakeAi({ fail: true }),
    } as unknown as HealthEnv);
    expect(down.find((c) => c.name === "Workers AI (embeddings)")?.state).toBe("failed");

    const empty = await runChecks({} as HealthEnv);
    expect(empty.map((c) => c.state)).toEqual(["absent", "absent", "absent", "absent"]);
  });

  it("honours suggestions being switched off", async () => {
    const checks = await runChecks({
      OAUTH_KV: kv,
      VECTORS: fakeVectors,
      AI: fakeAi({}),
      SUGGEST_MODEL: "off",
    } as unknown as HealthEnv);
    const suggestions = checks.find((c) => c.name === "Workers AI (suggestions)");
    expect(suggestions?.state).toBe("absent");
    expect(suggestions?.detail).toContain("SUGGEST_MODEL=off");
  });
});
