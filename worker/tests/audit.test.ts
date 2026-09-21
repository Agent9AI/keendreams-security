import { describe, expect, it } from "vitest";
import { appendAudit, GENESIS_HASH, verifyAuditChain } from "../src/memory/audit";
import { MIGRATIONS, migrate, schemaVersion } from "../src/memory/schema";
import { freshMemory, withSql } from "./helpers";

const AT = "2026-09-15T12:00:00.000Z";

function entry(n: number) {
  return { actor: "alice@example.com", action: "test.write", target: `t-${n}`, detail: { n } };
}

describe("schema", () => {
  it("migrates a new client database to the latest version", async () => {
    expect(await withSql(freshMemory(), (sql) => schemaVersion(sql))).toBe(MIGRATIONS.length);
  });

  it("is safe to run again", async () => {
    expect(await withSql(freshMemory(), (sql) => migrate(sql))).toBe(MIGRATIONS.length);
  });

  it("creates the memory tables and audit triggers", async () => {
    const names = await withSql(freshMemory(), (sql) =>
      sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger')")
        .toArray()
        .map((row) => row.name),
    );
    for (const name of [
      "episodes",
      "entities",
      "facts",
      "fact_evidence",
      "audit_log",
      "fts",
      "write_counters",
      "audit_log_no_update",
      "audit_log_no_delete",
    ]) {
      expect(names).toContain(name);
    }
  });
});

describe("audit log", () => {
  it("links each row to the previous row's hash", async () => {
    const rows = await withSql(freshMemory(), (sql) => {
      appendAudit(sql, AT, entry(1));
      appendAudit(sql, AT, entry(2));
      return sql
        .exec<{ seq: number; prev_hash: string; row_hash: string }>(
          "SELECT seq, prev_hash, row_hash FROM audit_log ORDER BY seq",
        )
        .toArray();
    });
    expect(rows.map((row) => row.seq)).toEqual([1, 2]);
    expect(rows[0]?.prev_hash).toBe(GENESIS_HASH);
    expect(rows[1]?.prev_hash).toBe(rows[0]?.row_hash);
  });

  it("verifies an untouched chain", async () => {
    const result = await withSql(freshMemory(), (sql) => {
      for (let n = 1; n <= 3; n++) appendAudit(sql, AT, entry(n));
      return verifyAuditChain(sql);
    });
    expect(result).toEqual({ ok: true, rows: 3 });
  });

  it("refuses updates and deletes", async () => {
    await withSql(freshMemory(), (sql) => {
      appendAudit(sql, AT, entry(1));
      expect(() => sql.exec("UPDATE audit_log SET actor = 'mallory@example.com'")).toThrow(
        /append-only/,
      );
      expect(() => sql.exec("DELETE FROM audit_log")).toThrow(/append-only/);
    });
  });

  it("reports the first row that was tampered with", async () => {
    const result = await withSql(freshMemory(), (sql) => {
      for (let n = 1; n <= 3; n++) appendAudit(sql, AT, entry(n));
      sql.exec("DROP TRIGGER audit_log_no_update");
      sql.exec("UPDATE audit_log SET actor = 'mallory@example.com' WHERE seq = 2");
      return verifyAuditChain(sql);
    });
    expect(result).toEqual({ ok: false, firstBadSeq: 2 });
  });

  it("is reachable over RPC", async () => {
    await expect(freshMemory().verifyAuditChain()).resolves.toEqual({ ok: true, rows: 0 });
  });
});
