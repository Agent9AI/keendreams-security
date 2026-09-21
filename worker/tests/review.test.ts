import { describe, expect, it } from "vitest";
import type { ClientMemory } from "../src/memory/ClientMemory";
import { memoryErrorCode } from "../src/memory/errors";
import { ALICE, freshMemory, SYNC_BOT, withSql } from "./helpers";

type Memory = DurableObjectStub<ClientMemory>;

const REVIEWER = "rita@example.com";
const PAIR = { subject: "asset:web-prod-03", object: "cve:CVE-2026-1234" };

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (err) {
    return memoryErrorCode(err);
  }
  return null;
}

async function evidence(memory: Memory): Promise<string> {
  const result = await memory.recordEpisode(ALICE, {
    content: `note ${crypto.randomUUID()}`,
    source: "analyst-note",
  });
  return result.episodeId;
}

async function propose(memory: Memory, predicate: string, pair = PAIR) {
  return memory.assertFact(ALICE, {
    ...pair,
    predicate,
    evidenceEpisodeId: await evidence(memory),
  });
}

function column(memory: Memory, factId: string, name: string): Promise<string | number | null> {
  return withSql(
    memory,
    (sql) =>
      sql
        .exec<{ value: string | number | null }>(
          `SELECT ${name} AS value FROM facts WHERE id = ?`,
          factId,
        )
        .one().value,
  );
}

describe("confirmFact", () => {
  it("trusts a proposal and applies supersession", async () => {
    const memory = freshMemory();
    const vuln = await memory.assertFact(
      SYNC_BOT,
      { ...PAIR, predicate: "HAS_VULN", evidenceEpisodeId: await evidence(memory) },
      "allowlisted_source",
    );
    const fix = await propose(memory, "REMEDIATED");
    const result = await memory.confirmFact(REVIEWER, fix.factId);
    expect(result).toMatchObject({
      factId: fix.factId,
      status: "trusted",
      superseded: [vuln.factId],
    });
    expect(await column(memory, fix.factId, "confirmed_by")).toBe(REVIEWER);
    expect(await column(memory, vuln.factId, "status")).toBe("superseded");
  });

  it("refuses facts that are missing or not proposed", async () => {
    const memory = freshMemory();
    const fact = await propose(memory, "HAS_VULN");
    await memory.confirmFact(REVIEWER, fact.factId);
    expect(await codeOf(memory.confirmFact(REVIEWER, fact.factId))).toBe("invalid_input");
    expect(await codeOf(memory.confirmFact(REVIEWER, "missing"))).toBe("not_found");
  });

  it("requires a reviewer identity", async () => {
    const memory = freshMemory();
    const fact = await propose(memory, "HAS_VULN");
    expect(await codeOf(memory.confirmFact("", fact.factId))).toBe("invalid_input");
  });
});

describe("rejectFact", () => {
  it("records who rejected a proposal and why", async () => {
    const memory = freshMemory();
    const fact = await propose(memory, "HAS_VULN");
    const result = await memory.rejectFact(REVIEWER, fact.factId, "Scanner misread the banner");
    expect(result.status).toBe("rejected");
    expect(await column(memory, fact.factId, "rejected_by")).toBe(REVIEWER);
    const detail = await withSql(
      memory,
      (sql) =>
        sql
          .exec<{ detail: string }>("SELECT detail FROM audit_log WHERE seq = ?", result.auditSeq)
          .one().detail,
    );
    expect(JSON.parse(detail)).toEqual({ reason: "Scanner misread the banner" });
  });
});

describe("rollbackTo", () => {
  it("reverts later decisions and reopens the facts they closed", async () => {
    const memory = freshMemory();
    const vuln = await propose(memory, "HAS_VULN");
    const firstConfirm = await memory.confirmFact(REVIEWER, vuln.factId);
    const fix = await propose(memory, "REMEDIATED");
    await memory.confirmFact(REVIEWER, fix.factId);

    const result = await memory.rollbackTo(REVIEWER, firstConfirm.auditSeq);

    expect(result.reopened).toEqual([vuln.factId]);
    expect(result.reverted).toEqual([fix.factId]);
    expect(await column(memory, vuln.factId, "status")).toBe("trusted");
    expect(await column(memory, vuln.factId, "superseded_by")).toBeNull();
    expect(await column(memory, fix.factId, "status")).toBe("proposed");
    expect(await column(memory, fix.factId, "confirmed_by")).toBeNull();
    expect(await memory.verifyAuditChain()).toMatchObject({ ok: true });
  });

  it("returns rejected and allowlisted facts to proposed", async () => {
    const memory = freshMemory();
    const baseline = await memory.recordEpisode(ALICE, { content: "baseline", source: "note" });
    const allowlisted = await memory.assertFact(
      SYNC_BOT,
      {
        subject: "asset:web-prod-05",
        predicate: "HAS_VULN",
        object: "cve:CVE-2026-1234",
        evidenceEpisodeId: await evidence(memory),
      },
      "allowlisted_source",
    );
    const rejected = await propose(memory, "OWNS", {
      subject: "identity:bob@example.com",
      object: "asset:web-prod-05",
    });
    await memory.rejectFact(REVIEWER, rejected.factId);

    const result = await memory.rollbackTo(REVIEWER, baseline.auditSeq ?? 0);

    expect([...result.reverted].sort()).toEqual([allowlisted.factId, rejected.factId].sort());
    expect(await column(memory, allowlisted.factId, "status")).toBe("proposed");
    expect(await column(memory, rejected.factId, "status")).toBe("proposed");
  });

  it("rejects targets outside the audit log", async () => {
    const memory = freshMemory();
    await propose(memory, "HAS_VULN");
    expect(await codeOf(memory.rollbackTo(REVIEWER, 999))).toBe("invalid_input");
    expect(await codeOf(memory.rollbackTo(REVIEWER, -1))).toBe("invalid_input");
  });
});
