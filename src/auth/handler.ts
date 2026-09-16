import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { type AccessSettings, type AppSettings, readAccessSettings, SetupError } from "../config";
import {
  AccessError,
  accessAuthorizeUrl,
  exchangeCode,
  type FetchLike,
  pkcePair,
  type UpstreamState,
  verifyIdToken,
} from "./access";
import { messagePage, renderConsent } from "./consent";
import {
  approvedClients,
  approvedClientsCookie,
  CLEAR_CSRF_COOKIE,
  csrfMatches,
  newCsrfToken,
} from "./cookies";
import { putOnce, takeOnce } from "./onceStore";
import type { AuthProps } from "./types";

export type AuthEnv = Env & AppSettings & { OAUTH_PROVIDER: OAuthHelpers };
export type AuthDeps = { fetch: FetchLike; now: () => number };

const CONSENT_PREFIX = "consent";
const UPSTREAM_PREFIX = "upstream";

const DEFAULT_DEPS: AuthDeps = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
};

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function callbackUri(request: Request): string {
  return new URL("/callback", request.url).toString();
}

function setupPage(error: SetupError): Response {
  return messagePage(
    "Finish setting up this deployment",
    `Add these settings as Worker secrets, then redeploy: ${error.missing.join(", ")}. The README's sign-in setup section lists where each value comes from.`,
    500,
  );
}

async function startAccessSignIn(
  env: AuthEnv,
  settings: AccessSettings,
  request: Request,
  oauthRequest: AuthRequest,
  cookies: string[] = [],
): Promise<Response> {
  const { verifier, challenge } = await pkcePair();
  const state = await putOnce<UpstreamState>(env.OAUTH_KV, UPSTREAM_PREFIX, {
    oauthRequest,
    codeVerifier: verifier,
  });
  const location = accessAuthorizeUrl(settings, {
    redirectUri: callbackUri(request),
    state,
    challenge,
  });
  return redirect(location, cookies);
}

/**
 * Browser routes for the OAuth provider's `defaultHandler`: the approval screen,
 * the hop to Cloudflare Access, and the callback that issues this server's token.
 */
export function createAuthHandler(deps: AuthDeps = DEFAULT_DEPS) {
  return {
    async fetch(request: Request, env: AuthEnv): Promise<Response> {
      const url = new URL(request.url);
      let settings: AccessSettings;
      try {
        settings = readAccessSettings(env);
      } catch (error) {
        if (error instanceof SetupError) return setupPage(error);
        throw error;
      }

      if (url.pathname === "/authorize" && request.method === "GET") {
        let oauthRequest: AuthRequest;
        try {
          oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
        } catch {
          return messagePage(
            "This sign-in link is not valid",
            "Start again from your MCP client.",
            400,
          );
        }
        const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
        if (!client) {
          return messagePage(
            "Unknown application",
            "This application is not registered here.",
            400,
          );
        }
        if ((await approvedClients(request, settings.cookieKey)).includes(client.clientId)) {
          return startAccessSignIn(env, settings, request, oauthRequest);
        }
        const consentId = await putOnce<AuthRequest>(env.OAUTH_KV, CONSENT_PREFIX, oauthRequest);
        const csrf = newCsrfToken();
        return renderConsent({
          clientName: client.clientName ?? client.clientId,
          redirectHost: new URL(oauthRequest.redirectUri).host,
          consentId,
          csrfToken: csrf.token,
          csrfCookie: csrf.cookie,
        });
      }

      if (url.pathname === "/authorize" && request.method === "POST") {
        const form = await request.formData();
        if (!csrfMatches(request, form.get("csrf"))) {
          return messagePage(
            "This form expired",
            "Start the sign-in again from your MCP client.",
            403,
          );
        }
        const consentId = form.get("consent_id");
        const oauthRequest = await takeOnce<AuthRequest>(
          env.OAUTH_KV,
          CONSENT_PREFIX,
          typeof consentId === "string" ? consentId : null,
        );
        if (!oauthRequest) {
          return messagePage(
            "This approval expired",
            "Start the sign-in again from your MCP client.",
            400,
          );
        }
        if (form.get("action") !== "approve") {
          const denied = new URL(oauthRequest.redirectUri);
          denied.searchParams.set("error", "access_denied");
          if (oauthRequest.state) denied.searchParams.set("state", oauthRequest.state);
          return redirect(denied.toString(), [CLEAR_CSRF_COOKIE]);
        }
        const approved = await approvedClientsCookie(
          request,
          settings.cookieKey,
          oauthRequest.clientId,
        );
        return startAccessSignIn(env, settings, request, oauthRequest, [
          approved,
          CLEAR_CSRF_COOKIE,
        ]);
      }

      if (url.pathname === "/callback" && request.method === "GET") {
        const upstream = await takeOnce<UpstreamState>(
          env.OAUTH_KV,
          UPSTREAM_PREFIX,
          url.searchParams.get("state"),
        );
        if (!upstream) {
          return messagePage(
            "This sign-in link expired",
            "Start the sign-in again from your MCP client.",
            400,
          );
        }
        if (url.searchParams.get("error")) {
          return messagePage("Sign-in was cancelled", "Nothing was connected.", 403);
        }
        try {
          const idToken = await exchangeCode(deps.fetch, settings, {
            code: url.searchParams.get("code") ?? "",
            codeVerifier: upstream.codeVerifier,
            redirectUri: callbackUri(request),
          });
          const claims = await verifyIdToken(
            deps.fetch,
            settings,
            idToken,
            Math.floor(deps.now() / 1000),
          );
          const client = await env.OAUTH_PROVIDER.lookupClient(upstream.oauthRequest.clientId);
          const props: AuthProps = {
            sub: claims.sub,
            email: claims.email,
            name: claims.name,
            clientId: upstream.oauthRequest.clientId,
            clientName: client?.clientName ?? upstream.oauthRequest.clientId,
          };
          const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
            request: upstream.oauthRequest,
            userId: claims.sub,
            metadata: { label: claims.email },
            scope: upstream.oauthRequest.scope,
            props,
          });
          return redirect(redirectTo);
        } catch (error) {
          if (error instanceof AccessError) {
            console.error(error.message);
            return messagePage("Sign-in failed", error.message, 403);
          }
          throw error;
        }
      }

      return messagePage("Not found", "There is nothing at this address.", 404);
    },
  };
}
