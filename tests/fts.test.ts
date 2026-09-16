import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { recordEpisode } from "../src/memory/episodes";
import { ftsQuery, ftsSearch } from "../src/search/fts";
import { contextAt, freshMemory, withSql } from "./helpers";

afterEach(async () => {
  await reset();
});

describe("ftsQuery", () => {
  it("quotes every term so punctuation cannot become FTS syntax", () => {
    expect(ftsQuery("web-prod-03")).toBe('"web-prod-03"');
    expect(ftsQuery("CVE-2026-1234 exposed")).toBe('"CVE-2026-1234" OR "exposed"');
  });

  it("refuses to build a query from punctuation alone", () => {
    expect(ftsQuery("   ")).toBeNull();
    expect(ftsQuery('*"^')).toBeNull();
  });

  it("drops single characters that would only add noise", () => {
    expect(ftsQuery("a b")).toBeNull();
    expect(ftsQuery("a panel")).toBe('"panel"');
  });

  it("splits on a quote instead of letting it close the phrase", () => {
    // The term pattern excludes quotes, so `we"b` becomes `we` and `b`, and the
    // single letter is then dropped. No quote can reach the MATCH expression.
    expect(ftsQuery('we"b OR nonsense')).toBe('"we" OR "OR" OR "nonsense"');
  });

  it("caps very long questions", () => {
    const terms = ftsQuery(new Array(50).fill("term").join(" "))?.split(" OR ") ?? [];
    expect(terms.length).toBeLessThanOrEqual(20);
  });
});

describe("ftsSearch", () => {
  it("finds the episode that mentions the host and ranks it first", async () => {
    await withSql(freshMemory(), (sql) => {
      const ctx = contextAt("2026-09-15T12:00:00.000Z");
      const hit = recordEpisode(sql, ctx, {
        content: "web-prod-03 exposes an unauthenticated admin panel",
        source: "nessus",
      });
      recordEpisode(sql, ctx, { content: "db-prod-01 is patched", source: "nessus" });

      const ids = ftsSearch(sql, "web-prod-03 admin panel", 10);
      expect(ids[0]).toBe(`episode:${hit.episodeId}`);
    });
  });

  it("returns nothing rather than throwing on a nonsense query", async () => {
    await withSql(freshMemory(), (sql) => {
      expect(ftsSearch(sql, '"""', 10)).toEqual([]);
    });
  });
});
