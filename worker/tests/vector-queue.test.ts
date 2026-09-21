import { reset, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { recordEpisode } from "../src/memory/episodes";
import {
  backoffMs,
  dueItems,
  enqueue,
  failedItems,
  MAX_ATTEMPTS,
  markDone,
  markFailed,
  pendingCount,
} from "../src/search/queue";
import { ALICE, contextAt, freshMemory, withSql } from "./helpers";
import { fakeBackend } from "./searchFixtures";

afterEach(async () => {
  await reset();
});

const AT = "2026-09-15T12:00:00.000Z";
const FAR_FUTURE = "2099-01-01T00:00:00.000Z";

describe("queue rows", () => {
  it("keeps one row per item and returns it when it is due", async () => {
    await withSql(freshMemory(), (sql) => {
      enqueue(sql, AT, "episode", "e1");
      enqueue(sql, AT, "episode", "e1");
      expect(pendingCount(sql)).toBe(1);
      expect(dueItems(sql, AT, 10)).toEqual([
        { itemId: "episode:e1", kind: "episode", refId: "e1", op: "upsert", attempts: 0 },
      ]);
    });
  });

  it("leaves an item alone until it is due", async () => {
    await withSql(freshMemory(), (sql) => {
      enqueue(sql, FAR_FUTURE, "fact", "f1");
      expect(dueItems(sql, AT, 10)).toEqual([]);
      expect(dueItems(sql, FAR_FUTURE, 10)).toHaveLength(1);
    });
  });

  it("removes an item once it is indexed", async () => {
    await withSql(freshMemory(), (sql) => {
      enqueue(sql, AT, "fact", "f1");
      markDone(sql, "fact:f1");
      expect(pendingCount(sql)).toBe(0);
      expect(dueItems(sql, AT, 10)).toEqual([]);
    });
  });

  it("backs off further after each failure and stops after five attempts", async () => {
    expect(backoffMs(0)).toBe(10_000);
    expect(backoffMs(3)).toBe(80_000);
    expect(backoffMs(20)).toBe(600_000);

    await withSql(freshMemory(), (sql) => {
      enqueue(sql, AT, "episode", "e2");
      const first = dueItems(sql, AT, 1)[0];
      expect(first).toBeDefined();
      if (!first) return;

      markFailed(sql, first, AT, new Error("boom"));
      expect(dueItems(sql, AT, 10)).toEqual([]);

      const afterBackoff = new Date(Date.parse(AT) + backoffMs(0) + 1).toISOString();
      expect(dueItems(sql, afterBackoff, 1)[0]?.attempts).toBe(1);

      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
        const due = dueItems(sql, FAR_FUTURE, 1)[0];
        expect(due?.attempts).toBe(attempt);
        if (due) markFailed(sql, due, AT, new Error("boom"));
      }

      expect(dueItems(sql, FAR_FUTURE, 10)).toEqual([]);
      expect(pendingCount(sql)).toBe(0);
      expect(failedItems(sql).map((item) => item.itemId)).toEqual(["episode:e2"]);
    });
  });

  it("re-queuing a failed item gives it a fresh start", async () => {
    await withSql(freshMemory(), (sql) => {
      enqueue(sql, AT, "episode", "e3");
      const item = dueItems(sql, AT, 1)[0];
      if (item) markFailed(sql, item, AT, new Error("boom"));

      enqueue(sql, AT, "episode", "e3");
      expect(dueItems(sql, AT, 10)).toEqual([
        { itemId: "episode:e3", kind: "episode", refId: "e3", op: "upsert", attempts: 0 },
      ]);
    });
  });
});

describe("writes enqueue their own indexing", () => {
  it("queues the episode it just recorded", async () => {
    await withSql(freshMemory(), (sql) => {
      const result = recordEpisode(sql, contextAt(AT), {
        content: "Nessus plugin 201455 on web-prod-03",
        source: "nessus",
      });
      expect(dueItems(sql, AT, 10).map((item) => item.itemId)).toEqual([
        `episode:${result.episodeId}`,
      ]);
    });
  });
});

describe("draining the queue", () => {
  it("indexes queued episodes under the client's namespace and clears them", async () => {
    const stub = freshMemory();
    const backend = fakeBackend();
    await withSql(stub, (_sql, instance) => {
      instance.setSearchBackend(backend);
      instance.rememberSlug("acme");
    });

    await stub.recordEpisode(ALICE, { content: "web-prod-03 is exposed", source: "nessus" });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(backend.upserted).toHaveLength(1);
    expect(backend.upserted[0]?.namespace).toBe("acme");
    expect(backend.upserted[0]?.id.startsWith("episode:")).toBe(true);
    expect(backend.upserted[0]?.values).toHaveLength(768);
    expect(await stub.queueStatus()).toEqual({ pending: 0, failed: 0 });
  });

  it("keeps the item and retries later when the backend is down", async () => {
    const stub = freshMemory();
    const backend = fakeBackend();
    backend.failNext(1);
    await withSql(stub, (_sql, instance) => instance.setSearchBackend(backend));

    await stub.recordEpisode(ALICE, { content: "retry me", source: "nessus" });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(backend.upserted).toHaveLength(0);
    expect(await stub.queueStatus()).toEqual({ pending: 1, failed: 0 });
  });

  it("schedules nothing at all without a backend", async () => {
    const stub = freshMemory();
    await withSql(stub, (_sql, instance) => instance.setSearchBackend(null));

    await stub.recordEpisode(ALICE, { content: "no backend here", source: "nessus" });
    expect(await runDurableObjectAlarm(stub)).toBe(false);
    expect(await stub.queueStatus()).toEqual({ pending: 1, failed: 0 });
  });

  it("falls back to the default namespace until the client names itself", async () => {
    const stub = freshMemory();
    const backend = fakeBackend();
    await withSql(stub, (_sql, instance) => instance.setSearchBackend(backend));

    await stub.recordEpisode(ALICE, { content: "unnamed client", source: "nessus" });
    await runDurableObjectAlarm(stub);
    expect(backend.upserted[0]?.namespace).toBe("default");
  });
});
