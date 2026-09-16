import OAuthProvider, { type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { type AuthEnv, createAuthHandler } from "./auth/handler";
import { mcpApiHandler } from "./mcp/server";

export { ClientMemory } from "./memory/ClientMemory";
export { Registry } from "./registry/registry";

const DAY_SECONDS = 24 * 60 * 60;
const authHandler = createAuthHandler();

/**
 * The OAuth provider owns the token endpoints and guards `/mcp`; everything else
 * (the consent screen, the Access hop, the callback) belongs to the auth handler.
 * Exported so tests can build the same helpers with `getOAuthApi`.
 */
export const oauthOptions: OAuthProviderOptions<Env> = {
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler,
  defaultHandler: {
    fetch: (request, env) => authHandler.fetch(request, env as AuthEnv),
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["memory"],
  accessTokenTTL: 3600,
  refreshTokenTTL: 30 * DAY_SECONDS,
};

export default new OAuthProvider(oauthOptions);
