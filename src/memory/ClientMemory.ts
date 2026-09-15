import { DurableObject } from "cloudflare:workers";
import { type ChainCheck, verifyAuditChain } from "./audit";
import { migrate } from "./schema";

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

  verifyAuditChain(): ChainCheck {
    return verifyAuditChain(this.sql);
  }
}
