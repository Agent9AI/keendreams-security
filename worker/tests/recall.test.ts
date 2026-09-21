import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientMemory } from "../src/memory/ClientMemory";
import { ALICE, codeOf, freshMemory, withSql } from "./helpers";
import { fakeBackend } from "./searchFixtures";

afterEach(async () => {
  await reset();
});

const REVIEWER = "reviewer@example.com";

async function seed(stub: DurableObjectStub<ClientMemory>) {
  const episode = await stub.recordEpisode(ALICE, {
    content: "Nessus found an unauthenticated admin panel on web-prod-03",
    source: "nessus",
  });
  const fact = await stub.assertFact(ALICE, {
    subject: "asset:web-prod-03",
    predicate: "HAS_VULN",
    object: "cve:CVE-2026-1234",
    evidenceEpisodeId: episode.episodeId,
  });
  return { episodeId: episode.episodeId, factId: fact.factId };
}

describe("recall", () => {
  it("returns only confirmed facts by default, with their evidence quoted", async () => {
    const stub = freshMemory();
    const { factId } = await seed(stub);

    const unconfirmed = await stub.recall({ query: "admin panel on web-prod-03" });
    expect(unconfirmed.count).toBe(0);

    await stub.confirmFact(REVIEWER, factId);
    const confirmed = await stub.recall({ query: "admin panel on web-prod-03" });
    expect(confirmed.count).toBe(1);
    const [top] = confirmed.results;
    expect(top?.id).toBe(factId);
    expect(top?.status).toBe("trusted");
    expect(top?.evidence.quote).toContain("web-prod-03");
    expect(top?.evidence.source).toBe("nessus");
  });

  it("includes proposals only when asked, and keeps them marked proposed", async () => {
    const stub = freshMemory();
    await seed(stub);
    const view = await stub.recall({ query: "web-prod-03", includeProposed: true });
    expect(view.count).toBe(1);
    expect(view.results[0]?.status).toBe("proposed");
  });

  it("reports keyword_only when there is no vector backend", async () => {
    const stub = freshMemory();
    await withSql(stub, (_sql, instance) => instance.setSearchBackend(null));
    const { factId } = await seed(stub);
    await stub.confirmFact(REVIEWER, factId);

    const view = await stub.recall({ query: "web-prod-03" });
    expect(view.searchMode).toBe("keyword_only");
    expect(view.count).toBe(1);
  });

  it("reports keyword_only when the vector backend fails, and still answers", async () => {
    const stub = freshMemory();
    const backend = fakeBackend();
    await withSql(stub, (_sql, instance) => instance.setSearchBackend(backend));
    const { factId } = await seed(stub);
    await stub.confirmFact(REVIEWER, factId);

    // Fail every call, not just one: the queue drain also embeds, and a single
    // scripted failure could be spent there instead of on the recall below.
    backend.failNext(99);
    const view = await stub.recall({ query: "web-prod-03" });
    expect(view.searchMode).toBe("keyword_only");
    expect(view.count).toBe(1);
  });

  it("finds a fact through the vector leg that the words alone would miss", async () => {
    const stub = freshMemory();
    const { episodeId, factId } = await seed(stub);
    await stub.confirmFact(REVIEWER, factId);
    await withSql(stub, (_sql, instance) => {
      instance.rememberSlug("acme");
      instance.setSearchBackend(fakeBackend({ hits: { acme: [`episode:${episodeId}`] } }));
    });

    const view = await stub.recall({ query: "machine reachable without a password" });
    expect(view.searchMode).toBe("hybrid");
    expect(view.count).toBe(1);
    expect(view.results[0]?.id).toBe(factId);
  });

  it("keeps one client's vectors out of another client's namespace", async () => {
    const stub = freshMemory();
    const { episodeId, factId } = await seed(stub);
    await stub.confirmFact(REVIEWER, factId);
    await withSql(stub, (_sql, instance) => {
      instance.rememberSlug("acme");
      // The hits are filed under a different client, so this namespace sees none.
      instance.setSearchBackend(fakeBackend({ hits: { beta: [`episode:${episodeId}`] } }));
    });

    const view = await stub.recall({ query: "machine reachable without a password" });
    expect(view.searchMode).toBe("hybrid");
    expect(view.count).toBe(0);
  });

  it("answers as of a past date", async () => {
    const stub = freshMemory();
    const { factId } = await seed(stub);
    await stub.confirmFact(REVIEWER, factId);
    const view = await stub.recall({ query: "web-prod-03", asOf: "2020-01-01T00:00:00.000Z" });
    expect(view.count).toBe(0);
  });

  it("attaches one hop of confirmed facts around the answer", async () => {
    const stub = freshMemory();
    const { factId } = await seed(stub);
    await stub.confirmFact(REVIEWER, factId);

    // The neighbour has to be genuinely out of reach of the question: its own
    // evidence, and no word the query searches for. Hang it off the episode that
    // does match and it arrives as a direct hit, proving nothing about neighbours.
    const ticket = await stub.recordEpisode(ALICE, {
      content: "Ticket SEC-142 tracks the remediation",
      source: "ticket",
    });
    const neighbour = await stub.assertFact(ALICE, {
      subject: "cve:CVE-2026-1234",
      predicate: "RELATED_TO",
      object: "ticket:SEC-142",
      evidenceEpisodeId: ticket.episodeId,
    });
    await stub.confirmFact(REVIEWER, neighbour.factId);

    const view = await stub.recall({ query: "unauthenticated admin panel" });
    expect(view.results.map((fact) => fact.id)).toEqual([factId]);
    expect(view.related.map((fact) => fact.id)).toContain(neighbour.factId);
  });

  it("refuses an empty question", async () => {
    const stub = freshMemory();
    expect(await codeOf(stub.recall({ query: "   " }))).toBe("invalid_input");
  });
});
