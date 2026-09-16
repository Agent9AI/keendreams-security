import { DurableObject } from "cloudflare:workers";
import type { FactOrigin } from "../policy/trust";
import { backendFromEnv, EMBED_CHARS, type SearchBackend } from "../search/backend";
import {
  dueItems,
  enqueue,
  failedItems,
  markDone,
  markFailed,
  pendingCount,
} from "../search/queue";
import { type RecallQuery, type RecallView, recall } from "../search/recall";
import { type ChainCheck, verifyAuditChain } from "./audit";
import { type EpisodeMeta, episodeMeta, recordEpisode } from "./episodes";
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

/** How soon after a write the alarm drains the queue. */
const DRAIN_DELAY_MS = 1_000;
/** Items embedded in one alarm run. Keeps each run well inside its limits. */
const DRAIN_BATCH = 20;

/** One instance per client, addressed as `client:<slug>`. */
export class ClientMemory extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  private backend: SearchBackend | null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.backend = backendFromEnv(env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => migrate(this.sql));
    });
  }

  async recordEpisode(
    principal: Principal,
    input: RecordEpisodeInput,
    options: WriteOptions = {},
  ): Promise<RecordEpisodeResult> {
    const ctx = this.writeContext(principal, options);
    const result = this.ctx.storage.transactionSync(() => {
      if (options.clientSlug) this.writeSlug(options.clientSlug);
      return recordEpisode(this.sql, ctx, input);
    });
    await this.scheduleDrain();
    return result;
  }

  /** `origin` is decided by the Worker from the Registry allowlist, never by the MCP caller. */
  async assertFact(
    principal: Principal,
    input: AssertFactInput,
    origin: FactOrigin = "mcp",
    options: WriteOptions = {},
  ): Promise<AssertFactResult> {
    const ctx = this.writeContext(principal, options);
    const result = this.ctx.storage.transactionSync(() => {
      if (options.clientSlug) this.writeSlug(options.clientSlug);
      return assertFact(this.sql, ctx, input, origin, options.suggestedByModel ?? null);
    });
    await this.scheduleDrain();
    return result;
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

  /** Hybrid search. Falls back to keyword only when the search backend is down. */
  recall(query: RecallQuery): Promise<RecallView> {
    return recall(this.sql, this.backend, this.clientSlug(), query, new Date().toISOString());
  }

  episodeMeta(episodeId: string): EpisodeMeta | null {
    return episodeMeta(this.sql, episodeId);
  }

  verifyAuditChain(): ChainCheck {
    return verifyAuditChain(this.sql);
  }

  /** Test seam. Production resolves the backend once, in the constructor. */
  setSearchBackend(backend: SearchBackend | null): void {
    this.backend = backend;
  }

  /** Records which client this database belongs to, for the Vectorize namespace. */
  rememberSlug(slug: string): void {
    this.ctx.storage.transactionSync(() => this.writeSlug(slug));
  }

  clientSlug(): string {
    const row = this.sql
      .exec<{ value: string }>("SELECT value FROM memory_meta WHERE key = 'client_slug'")
      .toArray()[0];
    return row?.value ?? "default";
  }

  queueStatus(): { pending: number; failed: number } {
    return { pending: pendingCount(this.sql), failed: failedItems(this.sql).length };
  }

  /** Re-queues every item that gave up. The /admin reindex action in Plan 4 calls this. */
  async reindexFailed(): Promise<number> {
    const failed = failedItems(this.sql);
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      for (const item of failed) enqueue(this.sql, now, item.kind, item.refId, item.op);
    });
    await this.scheduleDrain();
    return failed.length;
  }

  async alarm(): Promise<void> {
    const drainedAll = await this.drain();
    if (!drainedAll) await this.ctx.storage.setAlarm(Date.now() + DRAIN_DELAY_MS);
  }

  private writeSlug(slug: string): void {
    this.sql.exec(
      "INSERT INTO memory_meta (key, value) VALUES ('client_slug', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      slug,
    );
  }

  private async scheduleDrain(): Promise<void> {
    if (this.backend === null) return;
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + DRAIN_DELAY_MS);
    }
  }

  /** Returns true when the queue is empty, false when more work is waiting. */
  private async drain(): Promise<boolean> {
    const backend = this.backend;
    if (backend === null) return true;
    const now = new Date().toISOString();
    const items = dueItems(this.sql, now, DRAIN_BATCH);
    if (items.length === 0) return pendingCount(this.sql) === 0;

    const namespace = this.clientSlug();
    const texts = items.map((item) => this.indexText(item.kind, item.refId).slice(0, EMBED_CHARS));
    try {
      const vectors = await backend.embed(texts);
      await backend.upsert(
        items.map((item, index) => ({
          id: item.itemId,
          values: vectors[index] ?? [],
          namespace,
        })),
      );
      this.ctx.storage.transactionSync(() => {
        for (const item of items) markDone(this.sql, item.itemId);
      });
    } catch (error) {
      const at = new Date().toISOString();
      this.ctx.storage.transactionSync(() => {
        for (const item of items) markFailed(this.sql, item, at, error);
      });
    }
    return pendingCount(this.sql) === 0;
  }

  /** The text that represents an item in the index. Empty for anything since removed. */
  private indexText(kind: string, refId: string): string {
    const row = this.sql
      .exec<{ text: string }>(
        "SELECT text FROM fts WHERE kind = ? AND ref_id = ? LIMIT 1",
        kind,
        refId,
      )
      .toArray()[0];
    return row?.text ?? "";
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
