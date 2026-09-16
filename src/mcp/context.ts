import type { AuthProps } from "../auth/types";
import type { ClientMemory } from "../memory/ClientMemory";
import { MemoryError } from "../memory/errors";
import type { Principal } from "../memory/types";
import type { FactOrigin } from "../policy/trust";
import type { Registry } from "../registry/registry";
import type { AccessRole } from "../registry/store";

export type ToolEnv = Env;
export type ToolContext = {
  env: ToolEnv;
  props: AuthProps;
  adminEmails: Set<string>;
  origin: string;
};
export type OpenClient = {
  slug: string;
  role: AccessRole;
  memory: DurableObjectStub<ClientMemory>;
  registry: DurableObjectStub<Registry>;
  writesPerMinute: number;
};

export const REGISTRY_NAME = "registry";

export function principalOf(props: AuthProps): Principal {
  return {
    email: props.email.toLowerCase(),
    oauthClientId: props.clientId,
    oauthClientName: props.clientName,
  };
}

export function registryOf(env: ToolEnv): DurableObjectStub<Registry> {
  return env.REGISTRY.getByName(REGISTRY_NAME);
}

/** Resolves which client this person may open, and its write budget. */
export async function openClient(ctx: ToolContext, requested?: string): Promise<OpenClient> {
  const registry = registryOf(ctx.env);
  const access = await registry.resolveAccess({
    email: ctx.props.email,
    isAdmin: ctx.adminEmails.has(ctx.props.email.toLowerCase()),
    client: requested,
  });
  return {
    slug: access.slug,
    role: access.role,
    memory: ctx.env.CLIENT_MEMORY.getByName(`client:${access.slug}`),
    registry,
    writesPerMinute: await registry.writeLimit(access.slug),
  };
}

/**
 * Trust follows the evidence. A fact starts trusted only when the episode it cites
 * was recorded by this same identity and declared a source an admin allowlisted.
 */
export async function originForEvidence(
  open: OpenClient,
  principal: Principal,
  evidenceEpisodeId: string,
): Promise<FactOrigin> {
  const meta = await open.memory.episodeMeta(evidenceEpisodeId);
  if (!meta) {
    throw new MemoryError("not_found", `evidence episode "${evidenceEpisodeId}" does not exist`);
  }
  if (meta.principalEmail !== principal.email || meta.oauthClientId !== principal.oauthClientId) {
    return "mcp";
  }
  const allowed = await open.registry.isAllowlisted({
    clientSlug: open.slug,
    principalEmail: principal.email,
    oauthClientId: principal.oauthClientId,
    source: meta.source,
  });
  return allowed ? "allowlisted_source" : "mcp";
}
