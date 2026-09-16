import { reset, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientMemory } from "../src/memory/ClientMemory";
import { ANALYST, callTool, listTools } from "./mcpFixtures";
import { type FakeBackend, fakeBackend } from "./searchFixtures";

afterEach(async () => {
  await reset();
});

const REVIEWER = "reviewer@example.com";

/** The tools open `client:default`, so tests reach into that same instance. */
function defaultClient(): DurableObjectStub<ClientMemory> {
  return env.CLIENT_MEMORY.getByName("client:default");
}

async function useBackend(backend: FakeBackend | null) {
  await runInDurableObject(defaultClient(), (instance: ClientMemory) =>
    instance.setSearchBackend(backend),
  );
}

async function evidence(content: string) {
  const result = await callTool(ANALYST, "record_episode", { content, source: "nessus" });
  return String(result.data?.episodeId ?? "");
}

describe("the search tools", () => {
  it("offers recall and suggest_facts, and marks only recall read only", async () => {
    const tools = await listTools(ANALYST);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.has("recall")).toBe(true);
    expect(byName.has("suggest_facts")).toBe(true);
    expect(byName.get("recall")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("suggest_facts")?.annotations?.readOnlyHint).toBe(false);
  });

  it("recalls a confirmed fact and says which search mode answered", async () => {
    await useBackend(null);
    const episodeId = await evidence("web-prod-03 exposes an unauthenticated admin panel");
    const fact = await callTool(ANALYST, "assert_fact", {
      subject: "asset:web-prod-03",
      predicate: "HAS_VULN",
      object: "cve:CVE-2026-1234",
      evidence_episode_id: episodeId,
    });
    await defaultClient().confirmFact(REVIEWER, String(fact.data?.factId));

    const view = await callTool(ANALYST, "recall", { query: "admin panel web-prod-03" });
    expect(view.data?.search_mode).toBe("keyword_only");
    expect(view.data?.count).toBe(1);
    const [top] = (view.data?.results ?? []) as { confidenceLabel: string }[];
    expect(top?.confidenceLabel).toBe("TRUSTED");
  });

  it("reports a bad question with its code, not as a crash", async () => {
    await useBackend(null);
    const result = await callTool(ANALYST, "recall", { query: "   " });
    expect(result.isError).toBe(true);
    expect(result.text.startsWith("invalid_input:")).toBe(true);
  });

  it("proposes suggested facts as UNCONFIRMED and names the model", async () => {
    await useBackend(
      fakeBackend({
        suggestion: JSON.stringify({
          facts: [
            { subject: "asset:web-prod-03", predicate: "HAS_VULN", object: "cve:CVE-2026-1234" },
            { subject: "nonsense", predicate: "PWNED_BY", object: "also nonsense" },
          ],
        }),
      }),
    );
    const episodeId = await evidence("Nessus plugin 201455 fired on web-prod-03");

    const result = await callTool(ANALYST, "suggest_facts", { episode_id: episodeId });
    expect(result.data?.dropped).toBe(1);
    const proposals = (result.data?.proposals ?? []) as { confidenceLabel: string }[];
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.confidenceLabel).toBe("UNCONFIRMED");
    expect(result.data?.model).toBe("fake-model");

    const pending = await callTool(ANALYST, "list_proposals");
    expect(pending.data?.count).toBe(1);
  });

  it("never lets a suggestion arrive already trusted", async () => {
    await useBackend(
      fakeBackend({
        suggestion: JSON.stringify({
          facts: [
            { subject: "asset:web-prod-03", predicate: "HAS_VULN", object: "cve:CVE-2026-9999" },
          ],
        }),
      }),
    );
    const episodeId = await evidence("an episode an allowlisted agent recorded");
    await callTool(ANALYST, "suggest_facts", { episode_id: episodeId });

    const found = await callTool(ANALYST, "find_facts", { status: "proposed" });
    expect(found.data?.count).toBe(1);
    const trusted = await callTool(ANALYST, "find_facts", { status: "trusted" });
    expect(trusted.data?.count).toBe(0);
  });

  it("says suggestions are unavailable when the deployment has no model", async () => {
    await useBackend(null);
    const episodeId = await evidence("nothing to suggest from");
    const result = await callTool(ANALYST, "suggest_facts", { episode_id: episodeId });
    expect(result.isError).toBe(true);
    expect(result.text.startsWith("unavailable:")).toBe(true);
  });

  it("reports a missing episode as not_found", async () => {
    await useBackend(fakeBackend({ suggestion: JSON.stringify({ facts: [] }) }));
    const result = await callTool(ANALYST, "suggest_facts", { episode_id: "no-such-episode" });
    expect(result.isError).toBe(true);
    expect(result.text.startsWith("not_found:")).toBe(true);
  });
});
