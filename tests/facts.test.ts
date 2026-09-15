import { describe, expect, it } from "vitest";
import type { ClientMemory } from "../src/memory/ClientMemory";
import { memoryErrorCode } from "../src/memory/errors";
import { ALICE, freshMemory, SYNC_BOT, withSql } from "./helpers";

type Memory = DurableObjectStub<ClientMemory>;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (err) {
    return memoryErrorCode(err);
  }
  return null;
}

async function evidence(memory: Memory): Promise<string> {
  const result = await memory.recordEpisode(SYNC_BOT, {
    content: `scan ${crypto.randomUUID()}`,
    source: "tenable-hexa",
  });
  return result.episodeId;
}

function column(memory: Memory, factId: string, name: string): Promise<string | null> {
  return withSql(
    memory,
    (sql) =>
      sql
        .exec<{ value: string | null }>(`SELECT ${name} AS value FROM facts WHERE id = ?`, factId)
        .one().value,
  );
}

const PAIR = { subject: "asset:web-prod-03", object: "cve:CVE-2026-1234" };

async function trusted(memory: Memory, predicate: string, extra: Record<string, string> = {}) {
  return memory.assertFact(
    SYNC_BOT,
    { ...PAIR, predicate, evidenceEpisodeId: await evidence(memory), ...extra },
    "allowlisted_source",
  );
}

describe("assertFact", () => {
  it("proposes MCP writes", async () => {
    const memory = freshMemory();
    const result = await memory.assertFact(ALICE, {
      ...PAIR,
      predicate: "HAS_VULN",
      evidenceEpisodeId: await evidence(memory),
    });
    expect(result).toMatchObject({ status: "proposed", corroborated: false, superseded: [] });
    expect(await column(memory, result.factId, "proposed_by")).toBe("alice@example.com");
  });

  it("trusts writes from an allowlisted source", async () => {
    const memory = freshMemory();
    const result = await trusted(memory, "HAS_VULN");
    expect(result.status).toBe("trusted");
    expect(await column(memory, result.factId, "confirmed_by")).toBe(
      "allowlist:hexa-sync@example.com",
    );
  });

  it("rejects missing evidence", async () => {
    const memory = freshMemory();
    const code = await codeOf(
      memory.assertFact(ALICE, { ...PAIR, predicate: "HAS_VULN", evidenceEpisodeId: "missing" }),
    );
    expect(code).toBe("not_found");
  });

  it("rejects a shape the relationship does not allow", async () => {
    const memory = freshMemory();
    const code = await codeOf(
      memory.assertFact(ALICE, {
        subject: "identity:bob@example.com",
        predicate: "HAS_VULN",
        object: "cve:CVE-2026-1234",
        evidenceEpisodeId: await evidence(memory),
      }),
    );
    expect(code).toBe("invalid_input");
  });

  it("requires validTo to be later than validFrom", async () => {
    const memory = freshMemory();
    const code = await codeOf(
      memory.assertFact(ALICE, {
        ...PAIR,
        predicate: "HAS_VULN",
        evidenceEpisodeId: await evidence(memory),
        validFrom: "2026-09-10T00:00:00Z",
        validTo: "2026-09-01T00:00:00Z",
      }),
    );
    expect(code).toBe("invalid_input");
  });

  it("requires a model name for AI suggestions and only for them", async () => {
    const memory = freshMemory();
    const input = { ...PAIR, predicate: "HAS_VULN", evidenceEpisodeId: await evidence(memory) };
    expect(await codeOf(memory.assertFact(ALICE, input, "ai_suggestion"))).toBe("invalid_input");
    expect(
      await codeOf(memory.assertFact(ALICE, input, "mcp", { suggestedByModel: "some-model" })),
    ).toBe("invalid_input");
    const ok = await memory.assertFact(ALICE, input, "ai_suggestion", {
      suggestedByModel: "@cf/example/model",
    });
    expect(ok.status).toBe("proposed");
    expect(await column(memory, ok.factId, "suggested_by_model")).toBe("@cf/example/model");
  });

  it("corroborates an identical fact written with different key spellings", async () => {
    const memory = freshMemory();
    const first = await memory.assertFact(ALICE, {
      subject: "asset:WEB-PROD-03",
      predicate: "has_vuln",
      object: "cve:cve-2026-1234",
      evidenceEpisodeId: await evidence(memory),
    });
    const second = await memory.assertFact(ALICE, {
      ...PAIR,
      predicate: "HAS_VULN",
      evidenceEpisodeId: await evidence(memory),
    });
    expect(second).toMatchObject({ factId: first.factId, corroborated: true, status: "proposed" });
    const counts = await withSql(memory, (sql) => ({
      entities: sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM entities").one().n,
      evidence: sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM fact_evidence WHERE fact_id = ?",
          first.factId,
        )
        .one().n,
    }));
    expect(counts).toEqual({ entities: 2, evidence: 2 });
  });

  it("promotes a proposed fact when an allowlisted source asserts it", async () => {
    const memory = freshMemory();
    const proposed = await memory.assertFact(ALICE, {
      ...PAIR,
      predicate: "HAS_VULN",
      evidenceEpisodeId: await evidence(memory),
    });
    const promoted = await trusted(memory, "HAS_VULN");
    expect(promoted).toMatchObject({
      factId: proposed.factId,
      status: "trusted",
      corroborated: true,
    });
  });

  it("REMEDIATED closes HAS_VULN for the same pair", async () => {
    const memory = freshMemory();
    const vuln = await trusted(memory, "HAS_VULN");
    const fixed = await trusted(memory, "REMEDIATED");
    expect(fixed.superseded).toEqual([vuln.factId]);
    expect(await column(memory, vuln.factId, "status")).toBe("superseded");
    expect(await column(memory, vuln.factId, "superseded_by")).toBe(fixed.factId);
  });

  it("a later trusted HAS_VULN closes REMEDIATED", async () => {
    const memory = freshMemory();
    await trusted(memory, "HAS_VULN");
    const fixed = await trusted(memory, "REMEDIATED");
    const regressed = await trusted(memory, "HAS_VULN");
    expect(regressed.corroborated).toBe(false);
    expect(regressed.superseded).toEqual([fixed.factId]);
  });

  it("proposed facts close nothing", async () => {
    const memory = freshMemory();
    const vuln = await trusted(memory, "HAS_VULN");
    const proposal = await memory.assertFact(ALICE, {
      ...PAIR,
      predicate: "REMEDIATED",
      evidenceEpisodeId: await evidence(memory),
    });
    expect(proposal.superseded).toEqual([]);
    expect(await column(memory, vuln.factId, "status")).toBe("trusted");
  });

  it("does not close facts about a different asset", async () => {
    const memory = freshMemory();
    const vuln = await trusted(memory, "HAS_VULN");
    await memory.assertFact(
      SYNC_BOT,
      {
        subject: "asset:web-prod-04",
        predicate: "REMEDIATED",
        object: "cve:CVE-2026-1234",
        evidenceEpisodeId: await evidence(memory),
      },
      "allowlisted_source",
    );
    expect(await column(memory, vuln.factId, "status")).toBe("trusted");
  });

  it("a renewed accepted risk replaces the old one without editing its expiry", async () => {
    const memory = freshMemory();
    const first = await trusted(memory, "ACCEPTED_RISK", {
      validTo: "2026-12-31T00:00:00Z",
      reason: "WAF rule blocks the path",
    });
    const renewed = await trusted(memory, "ACCEPTED_RISK", {
      validTo: "2027-03-31T00:00:00Z",
      reason: "Vendor patch slipped to Q1",
    });
    expect(renewed.superseded).toEqual([first.factId]);
    expect(await column(memory, first.factId, "valid_to")).toBe("2026-12-31T00:00:00.000Z");
  });

  it("keeps the audit chain valid across writes", async () => {
    const memory = freshMemory();
    await trusted(memory, "HAS_VULN");
    await trusted(memory, "REMEDIATED");
    const check = await memory.verifyAuditChain();
    expect(check).toEqual({ ok: true, rows: 4 });
  });
});
