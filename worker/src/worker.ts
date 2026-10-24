import OAuthProvider, { type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { type AuthEnv, createAuthHandler } from "./auth/handler";
import { mcpApiHandler } from "./mcp/server";

export { ClientMemory } from "./memory/ClientMemory";
export { Registry } from "./registry/registry";

const DAY_SECONDS = 24 * 60 * 60;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const authHandler = createAuthHandler();

/**
 * The OAuth provider owns the token endpoints and guards `/mcp`; everything else
 * (the consent screen, the Access hop, the callback) belongs to the auth handler.
 *
 * Every token is bound to the canonical resource `<origin>/mcp`. That is the value
 * this server advertised before it was named explicitly, so grants issued earlier
 * keep working. It is derived from the request so a deployment needs no hostname
 * setting. Exported so tests can build the same helpers with `getOAuthApi`.
 */
export function oauthOptions(origin: string): OAuthProviderOptions<Env> {
  return {
    apiRoute: "/mcp",
    apiHandler: mcpApiHandler,
    defaultHandler: {
      fetch: (request, env) => authHandler.fetch(request, env as AuthEnv),
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    scopesSupported: ["memory"],
    resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * DAY_SECONDS,
  };
}

const providers = new Map<string, OAuthProvider<Env>>();

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    // A resource must be HTTPS outside loopback, so send plain HTTP to its HTTPS twin.
    if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 308);
    }
    let provider = providers.get(url.origin);
    if (!provider) {
      provider = new OAuthProvider(oauthOptions(url.origin));
      providers.set(url.origin, provider);
    }
    return provider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
