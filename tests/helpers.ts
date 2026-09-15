import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ClientMemory } from "../src/memory/ClientMemory";
import type { Principal, WriteContext } from "../src/memory/types";

export const ALICE: Principal = {
  email: "alice@example.com",
  oauthClientId: "client-alice",
  oauthClientName: "Claude Code",
};

export const SYNC_BOT: Principal = {
  email: "hexa-sync@example.com",
  oauthClientId: "client-sync",
  oauthClientName: "hexa-sync",
};

/** A new, empty client database per call, so tests never share state. */
export function freshMemory(): DurableObjectStub<ClientMemory> {
  return env.CLIENT_MEMORY.getByName(`test-${crypto.randomUUID()}`);
}

/** Run code inside the Durable Object with direct access to its SQLite handle. */
export function withSql<R>(
  stub: DurableObjectStub<ClientMemory>,
  fn: (sql: SqlStorage, instance: ClientMemory) => R | Promise<R>,
): Promise<R> {
  return runInDurableObject(stub, (instance: ClientMemory, state) =>
    fn(state.storage.sql, instance),
  );
}

/** A write context pinned to a moment in time, for calling storage modules directly. */
export function contextAt(
  iso: string,
  principal: Principal = ALICE,
  writesPerMinute = 1000,
): WriteContext {
  const nowMs = Date.parse(iso);
  return {
    principal,
    now: new Date(nowMs).toISOString(),
    nowMs,
    newId: () => crypto.randomUUID(),
    writesPerMinute,
  };
}
