import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import {
  type AccessSettings,
  type AppSettings,
  readAccessSettings,
  SETTING_NAMES,
  SetupError,
} from "../config";
import { adminResponse } from "../web/admin";
import { DEMO_IDENTITY, demoCookieKey, isDemoMode } from "../web/demo";
import { reviewResponse } from "../web/review";
import { setupPage } from "../web/setup";
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
import { approvedClients, approvedClientsCookie, CLEAR_CSRF_COOKIE, newCsrfToken } from "./cookies";
import { putOnce, takeOnce } from "./onceStore";
import { readSession, sessionCookie } from "./session";
import type { AuthProps } from "./types";

export type AuthEnv = Env & AppSettings & { OAUTH_PROVIDER: OAuthHelpers };
export type AuthDeps = { fetch: FetchLike; now: () => number };

const CONSENT_PREFIX = "consent";
const UPSTREAM_PREFIX = "upstream";

type ConsentState = { oauthRequest: AuthRequest; csrfToken: string };

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

async function startBrowserSignIn(
  env: AuthEnv,
  settings: AccessSettings,
  request: Request,
  returnTo: string,
): Promise<Response> {
  const { verifier, challenge } = await pkcePair();
  const state = await putOnce<UpstreamState>(env.OAUTH_KV, UPSTREAM_PREFIX, {
    returnTo,
    codeVerifier: verifier,
  });
  return redirect(
    accessAuthorizeUrl(settings, { redirectUri: callbackUri(request), state, challenge }),
  );
}

/**
 * Browser routes for the OAuth provider's `defaultHandler`: the approval screen,
 * the hop to Cloudflare Access, the callback that issues this server's token, and
 * the review queue where a person confirms or rejects proposed facts.
 */
export function createAuthHandler(deps: AuthDeps = DEFAULT_DEPS) {
  return {
    async fetch(request: Request, env: AuthEnv): Promise<Response> {
      const url = new URL(request.url);

      // Demo mode answers only on loopback and needs no Access application, so it
      // is resolved before the settings that a real deployment requires.
      const browserPage = url.pathname === "/review" || url.pathname === "/admin";
      const page = url.pathname === "/admin" ? adminResponse : reviewResponse;

      if (browserPage && isDemoMode(env, url)) {
        const key = demoCookieKey();
        const session = await readSession(request, key, deps.now());
        if (session === null) {
          return redirect(url.toString(), [await sessionCookie(key, DEMO_IDENTITY, deps.now())]);
        }
        return page(request, env, session);
      }

      let settings: AccessSettings;
      try {
        settings = readAccessSettings(env);
      } catch (error) {
        if (error instanceof SetupError) {
          return setupPage(env, url.origin, SETTING_NAMES);
        }
        throw error;
      }

      if (browserPage) {
        const session = await readSession(request, settings.cookieKey, deps.now());
        if (session === null) {
          if (request.method !== "GET") {
            return messagePage("Your session expired", "Open the page again.", 403);
          }
          return startBrowserSignIn(env, settings, request, `${url.pathname}${url.search}`);
        }
        return page(request, env, session);
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
        const csrf = newCsrfToken();
        const consentId = await putOnce<ConsentState>(env.OAUTH_KV, CONSENT_PREFIX, {
          oauthRequest,
          csrfToken: csrf.token,
        });
        return renderConsent({
          clientName: client.clientName ?? client.clientId,
          redirectHost: new URL(oauthRequest.redirectUri).host,
          accessOrigin: new URL(settings.authorizationUrl).origin,
          consentId,
          csrfToken: csrf.token,
          csrfCookie: csrf.cookie,
        });
      }

      if (url.pathname === "/authorize" && request.method === "POST") {
        const form = await request.formData();
        const consentId = form.get("consent_id");
        const consent = await takeOnce<ConsentState>(
          env.OAUTH_KV,
          CONSENT_PREFIX,
          typeof consentId === "string" ? consentId : null,
        );
        if (
          !consent ||
          typeof form.get("csrf") !== "string" ||
          form.get("csrf") !== consent.csrfToken
        ) {
          return messagePage(
            "This form expired",
            "Start the sign-in again from your MCP client.",
            403,
          );
        }
        const oauthRequest = consent.oauthRequest;
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
          const browserSession = await sessionCookie(settings.cookieKey, claims, deps.now());
          const oauthRequest = upstream.oauthRequest;
          if (!oauthRequest) {
            return redirect(upstream.returnTo ?? "/review", [browserSession]);
          }
          const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
          const props: AuthProps = {
            sub: claims.sub,
            email: claims.email,
            name: claims.name,
            clientId: oauthRequest.clientId,
            clientName: client?.clientName ?? oauthRequest.clientId,
          };
          const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
            request: oauthRequest,
            userId: claims.sub,
            metadata: { label: claims.email },
            scope: oauthRequest.scope,
            props,
          });
          return redirect(redirectTo, [browserSession]);
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
