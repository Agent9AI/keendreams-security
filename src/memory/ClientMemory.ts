import { DurableObject } from "cloudflare:workers";
import type { FactOrigin } from "../policy/trust";
import { type ChainCheck, verifyAuditChain } from "./audit";
import { recordEpisode } from "./episodes";
import { MemoryError } from "./errors";
import { assertFact } from "./facts";
import { DEFAULT_WRITES_PER_MINUTE } from "./limits";
import { migrate } from "./schema";
import type {
  AssertFactInput,
  AssertFactResult,
  Principal,
  RecordEpisodeInput,
  RecordEpisodeResult,
  WriteContext,
  WriteOptions,
} from "./types";
import { clampLimit } from "./validate";

/** One instance per client, addressed as `client:<slug>`. */
export class ClientMemory extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => migrate(this.sql));
    });
  }

  recordEpisode(
    principal: Principal,
    input: RecordEpisodeInput,
    options: WriteOptions = {},
  ): RecordEpisodeResult {
    const ctx = this.writeContext(principal, options);
    return this.ctx.storage.transactionSync(() => recordEpisode(this.sql, ctx, input));
  }

  /** `origin` is decided by the Worker from the Registry allowlist, never by the MCP caller. */
  assertFact(
    principal: Principal,
    input: AssertFactInput,
    origin: FactOrigin = "mcp",
    options: WriteOptions = {},
  ): AssertFactResult {
    const ctx = this.writeContext(principal, options);
    return this.ctx.storage.transactionSync(() =>
      assertFact(this.sql, ctx, input, origin, options.suggestedByModel ?? null),
    );
  }

  verifyAuditChain(): ChainCheck {
    return verifyAuditChain(this.sql);
  }

  private writeContext(principal: Principal, options: WriteOptions): WriteContext {
    if (!principal?.email || !principal.oauthClientId || !principal.oauthClientName) {
      throw new MemoryError("invalid_input", "principal must include email and OAuth client");
    }
    const nowMs = Date.now();
    return {
      principal,
      now: new Date(nowMs).toISOString(),
      nowMs,
      newId: () => crypto.randomUUID(),
      writesPerMinute: clampLimit(options.writesPerMinute, DEFAULT_WRITES_PER_MINUTE, 10_000),
    };
  }
}
