import { DurableObject } from "cloudflare:workers";
import { type ChainCheck, verifyAuditChain } from "../memory/audit";
import { migrateRegistry } from "./schema";
import {
  type AccessQuery,
  type AllowRule,
  allowSource,
  type ClientAccess,
  type ClientRow,
  createClient,
  isAllowlisted,
  listAllowRules,
  listClients,
  listMembers,
  type MemberRole,
  type MemberRow,
  type Mode,
  type ModeState,
  modeState,
  removeMember,
  resolveAccess,
  revokeSource,
  setMember,
  setMode,
  setWriteLimit,
  writeLimit,
} from "./store";

/** The single deployment-wide registry, addressed by the name `registry`. */
export class Registry extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => migrateRegistry(this.sql));
    });
  }

  resolveAccess(query: AccessQuery): ClientAccess {
    return resolveAccess(this.sql, query);
  }

  modeState(): ModeState {
    return modeState(this.sql);
  }

  setMode(actor: string, mode: Mode): ModeState {
    return this.write(() => setMode(this.sql, actor, mode, this.now()));
  }

  createClient(actor: string, slug: string, name: string): ClientRow {
    return this.write(() => createClient(this.sql, actor, slug, name, this.now()));
  }

  listClients(): ClientRow[] {
    return listClients(this.sql);
  }

  setMember(actor: string, email: string, slug: string, role: MemberRole): MemberRow {
    return this.write(() => setMember(this.sql, actor, email, slug, role, this.now()));
  }

  removeMember(actor: string, email: string, slug: string): boolean {
    return this.write(() => removeMember(this.sql, actor, email, slug, this.now()));
  }

  listMembers(slug: string): MemberRow[] {
    return listMembers(this.sql, slug);
  }

  allowSource(actor: string, rule: AllowRule): AllowRule {
    return this.write(() => allowSource(this.sql, actor, rule, this.now()));
  }

  revokeSource(actor: string, rule: AllowRule): boolean {
    return this.write(() => revokeSource(this.sql, actor, rule, this.now()));
  }

  listAllowRules(slug: string): AllowRule[] {
    return listAllowRules(this.sql, slug);
  }

  isAllowlisted(rule: AllowRule): boolean {
    return isAllowlisted(this.sql, rule);
  }

  setWriteLimit(actor: string, slug: string, writesPerMinute: number): number {
    return this.write(() => setWriteLimit(this.sql, actor, slug, writesPerMinute, this.now()));
  }

  writeLimit(slug: string): number {
    return writeLimit(this.sql, slug);
  }

  verifyAuditChain(): ChainCheck {
    return verifyAuditChain(this.sql);
  }

  private write<T>(fn: () => T): T {
    return this.ctx.storage.transactionSync(fn);
  }

  private now(): string {
    return new Date().toISOString();
  }
}
