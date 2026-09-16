import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { ANALYST, BOB, callTool, listTools, registry, SYNC_AGENT } from "./mcpFixtures";

const ADMIN = "admin@example.com";
const PAIR = { subject: "asset:web-prod-03", object: "cve:CVE-2026-1234" };

afterEach(async () => {
  await reset();
});

async function evidence(props = ANALYST, source = "analyst-note") {
  const result = await callTool(props, "record_episode", {
    content: `scan ${crypto.randomUUID()}`,
    source,
  });
  return String(result.data?.episodeId ?? "");
}

describe("tool surface", () => {
  it("exposes the seven memory tools and marks the read-only ones", async () => {
    const tools = await listTools(ANALYST);
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "assert_fact",
      "explore_graph",
      "fact_history",
      "find_facts",
      "get_entity",
      "list_proposals",
      "record_episode",
    ]);
    const readOnly = tools
      .filter((tool) => tool.annotations?.readOnlyHint)
      .map((tool) => tool.name);
    expect(readOnly.sort()).toEqual([
      "explore_graph",
      "fact_history",
      "find_facts",
      "get_entity",
      "list_proposals",
    ]);
  });

  it("refuses requests without a signed-in identity", async () => {
    expect((await callTool(null, "find_facts")).status).toBe(401);
  });

  it("refuses a browser request from another origin", async () => {
    const result = await callTool(ANALYST, "find_facts", {}, { origin: "https://evil.example" });
    expect(result.status).toBe(403);
  });
});

describe("writing memory", () => {
  it("records evidence and proposes a fact marked UNCONFIRMED", async () => {
    const episodeId = await evidence();
    const result = await callTool(ANALYST, "assert_fact", {
      ...PAIR,
      predicate: "HAS_VULN",
      evidence_episode_id: episodeId,
    });
    expect(result.data).toMatchObject({
      client: "default",
      status: "proposed",
      confidenceLabel: "UNCONFIRMED",
    });
    expect(String(result.data?.review_url)).toContain("/review?client=default");
  });

  it("reports invalid input with its code and no internal details", async () => {
    const episodeId = await evidence();
    const result = await callTool(ANALYST, "assert_fact", {
      ...PAIR,
      predicate: "PWNED_BY",
      evidence_episode_id: episodeId,
    });
    expect(result.isError).toBe(true);
    expect(result.text.startsWith("invalid_input:")).toBe(true);
    expect(result.text).not.toContain("at ");
  });

  it("applies the client's write limit", async () => {
    await registry().setWriteLimit(ADMIN, "default", 1);
    expect(
      (await callTool(ANALYST, "record_episode", { content: "one", source: "note" })).isError,
    ).toBe(false);
    const second = await callTool(ANALYST, "record_episode", { content: "two", source: "note" });
    expect(second.isError).toBe(true);
    expect(second.text.startsWith("rate_limited:")).toBe(true);
  });
});

describe("trusted sources", () => {
  it("trusts an allowlisted identity writing from its own allowlisted source", async () => {
    await registry().allowSource(ADMIN, {
      clientSlug: "default",
      principalEmail: "sync@example.com",
      oauthClientId: "client-sync",
      source: "tenable-hexa",
    });
    const episodeId = await evidence(SYNC_AGENT, "tenable-hexa");
    const result = await callTool(SYNC_AGENT, "assert_fact", {
      ...PAIR,
      predicate: "HAS_VULN",
      evidence_episode_id: episodeId,
    });
    expect(result.data).toMatchObject({ status: "trusted", confidenceLabel: "TRUSTED" });
  });

  it("keeps proposals unconfirmed for another source or another identity", async () => {
    await registry().allowSource(ADMIN, {
      clientSlug: "default",
      principalEmail: "sync@example.com",
      oauthClientId: "client-sync",
      source: "tenable-hexa",
    });
    const otherSource = await evidence(SYNC_AGENT, "pasted-chat");
    const bySource = await callTool(SYNC_AGENT, "assert_fact", {
      ...PAIR,
      predicate: "HAS_VULN",
      evidence_episode_id: otherSource,
    });
    expect(bySource.data).toMatchObject({ status: "proposed" });

    const agentEpisode = await evidence(SYNC_AGENT, "tenable-hexa");
    const byAnalyst = await callTool(ANALYST, "assert_fact", {
      subject: "asset:web-prod-04",
      object: "cve:CVE-2026-1234",
      predicate: "HAS_VULN",
      evidence_episode_id: agentEpisode,
    });
    expect(byAnalyst.data).toMatchObject({ status: "proposed" });
  });
});

describe("multiple clients", () => {
  async function multiClient() {
    const reg = registry();
    await reg.setMode(ADMIN, "multi");
    await reg.createClient(ADMIN, "acme", "Acme Corp");
    await reg.createClient(ADMIN, "beta", "Beta Inc");
    await reg.setMember(ADMIN, "alice@example.com", "acme", "member");
    await reg.setMember(ADMIN, "bob@example.com", "beta", "member");
  }

  it("requires a client, honours membership and keeps clients apart", async () => {
    await multiClient();
    const missing = await callTool(ANALYST, "find_facts");
    expect(missing.isError).toBe(true);
    expect(missing.text.startsWith("invalid_input:")).toBe(true);

    const forbidden = await callTool(BOB, "find_facts", { client: "acme" });
    expect(forbidden.isError).toBe(true);
    expect(forbidden.text.startsWith("forbidden_client:")).toBe(true);

    const episode = await callTool(ANALYST, "record_episode", {
      client: "acme",
      content: "acme scan",
      source: "nessus",
    });
    await callTool(ANALYST, "assert_fact", {
      client: "acme",
      ...PAIR,
      predicate: "HAS_VULN",
      evidence_episode_id: String(episode.data?.episodeId),
    });

    const inAcme = await callTool(ANALYST, "find_facts", { client: "acme", status: "proposed" });
    expect(inAcme.data?.count).toBe(1);
    const inBeta = await callTool(BOB, "find_facts", { client: "beta", status: "proposed" });
    expect(inBeta.data?.count).toBe(0);
  });
});

describe("reading memory", () => {
  it("lists proposals with evidence and a review link", async () => {
    const episodeId = await evidence();
    await callTool(ANALYST, "assert_fact", {
      ...PAIR,
      predicate: "HAS_VULN",
      evidence_episode_id: episodeId,
    });
    const result = await callTool(ANALYST, "list_proposals");
    expect(result.data?.count).toBe(1);
    expect(String(result.data?.review_url)).toContain("/review?client=default");
    const [proposal] = (result.data?.proposals ?? []) as {
      confidenceLabel: string;
      evidence: { quote: string };
    }[];
    expect(proposal?.confidenceLabel).toBe("UNCONFIRMED");
    expect(proposal?.evidence.quote.length).toBeGreaterThan(0);
  });
});
