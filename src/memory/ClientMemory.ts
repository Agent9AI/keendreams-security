import { DurableObject } from "cloudflare:workers";
import type { FactOrigin } from "../policy/trust";
import { type ChainCheck, verifyAuditChain } from "./audit";
import { recordEpisode } from "./episodes";
import { MemoryError } from "./errors";
import { assertFact } from "./facts";
import type { FactView } from "./factView";
import { DEFAULT_WRITES_PER_MINUTE } from "./limits";
import {
  type EntityView,
  exploreGraph,
  type FindFactsQuery,
  factHistory,
  findFacts,
  type GraphQuery,
  type GraphView,
  getEntity,
  type HistoryQuery,
  type HistoryView,
  listProposals,
  type ProposalView,
} from "./queries";
import { confirmFact, rejectFact, rollbackTo } from "./review";
import { migrate } from "./schema";
import type {
  AssertFactInput,
  AssertFactResult,
  Principal,
  RecordEpisodeInput,
  RecordEpisodeResult,
  ReviewContext,
  ReviewResult,
  RollbackResult,
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

  /** Browser review only: the Worker checks canReview(role, "browser") before calling. */
  confirmFact(reviewerEmail: string, factId: string): ReviewResult {
    const ctx = this.reviewContext(reviewerEmail);
    return this.ctx.storage.transactionSync(() => confirmFact(this.sql, ctx, factId));
  }

  rejectFact(reviewerEmail: string, factId: string, reason?: string): ReviewResult {
    const ctx = this.reviewContext(reviewerEmail);
    return this.ctx.storage.transactionSync(() => rejectFact(this.sql, ctx, factId, reason));
  }

  rollbackTo(reviewerEmail: string, toSeq: number): RollbackResult {
    const ctx = this.reviewContext(reviewerEmail);
    return this.ctx.storage.transactionSync(() => rollbackTo(this.sql, ctx, toSeq));
  }

  findFacts(query: FindFactsQuery = {}): FactView[] {
    return findFacts(this.sql, query, new Date().toISOString());
  }

  getEntity(key: string): EntityView {
    return getEntity(this.sql, key, new Date().toISOString());
  }

  exploreGraph(query: GraphQuery): GraphView {
    return exploreGraph(this.sql, query, new Date().toISOString());
  }

  factHistory(query: HistoryQuery): HistoryView {
    return factHistory(this.sql, query);
  }

  listProposals(limit?: number): ProposalView[] {
    return listProposals(this.sql, limit);
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

  private reviewContext(reviewerEmail: string): ReviewContext {
    return { reviewerEmail, now: new Date().toISOString() };
  }
}
