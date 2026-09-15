import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ClientMemory } from "../src/memory/ClientMemory";

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
