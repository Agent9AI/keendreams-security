import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createAuthHandler } from "../src/auth/handler";
import {
  fakeFetch,
  idClaims,
  signJwt,
  TEST_ENV_SETTINGS,
  TEST_SETTINGS,
  testSigningKey,
} from "./authFixtures";
import { CLIENT_REDIRECT, fakeOAuth, KNOWN_CLIENT_ID } from "./oauthFake";

const ORIGIN = "https://memory.example.com";
const NOW_SECONDS = 1_789_000_000;

async function setup(options: { settings?: Record<string, string | undefined> } = {}) {
  const key = await testSigningKey();
  const oauth = fakeOAuth();
  const fake = fakeFetch({
    [TEST_SETTINGS.jwksUrl]: () => Response.json(key.jwks),
    [TEST_SETTINGS.tokenUrl]: async () =>
      Response.json({
        id_token: await signJwt(
          key.privateKey,
          { alg: "RS256", kid: key.kid },
          idClaims(NOW_SECONDS),
        ),
      }),
  });
  const handler = createAuthHandler({ fetch: fake.fetch, now: () => NOW_SECONDS * 1000 });
  const testEnv = {
    ...env,
    ...TEST_ENV_SETTINGS,
    ...options.settings,
    OAUTH_PROVIDER: oauth.helpers,
  };
  const call = (path: string, init?: RequestInit) =>
    handler.fetch(new Request(`${ORIGIN}${path}`, init), testEnv as never);
  return { call, oauth, fake, key };
}

function authorizeUrl(clientId = KNOWN_CLIENT_ID): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CLIENT_REDIRECT,
    scope: "memory",
    state: "client-state",
  });
  return `/authorize?${params}`;
}

function inputValue(html: string, name: string): string {
  return new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1] ?? "";
}

function cookieValue(setCookie: string | null): string {
  return setCookie?.split(";")[0] ?? "";
}

async function approveFlow(call: Awaited<ReturnType<typeof setup>>["call"]) {
  const consent = await call(authorizeUrl());
  const html = await consent.text();
  const csrfCookie = cookieValue(consent.headers.get("set-cookie"));
  const body = new URLSearchParams({
    action: "approve",
    consent_id: inputValue(html, "consent_id"),
    csrf: inputValue(html, "csrf"),
  });
  return call("/authorize", {
    method: "POST",
    headers: { cookie: csrfCookie, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("GET /authorize", () => {
  it("shows a consent page with escaped client details and security headers", async () => {
    const { call } = await setup();
    const response = await call(authorizeUrl());
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("client.example");
    expect(inputValue(html, "consent_id")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inputValue(html, "csrf")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get("set-cookie")).toContain("__Host-kd_csrf=");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("refuses an unregistered client", async () => {
    const { call } = await setup();
    expect((await call(authorizeUrl("stranger"))).status).toBe(400);
  });

  it("skips consent for a client this browser already approved", async () => {
    const { call } = await setup();
    const approved = await approveFlow(call);
    const approvedCookie = (approved.headers.get("set-cookie") ?? "")
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.startsWith("__Host-kd_approved="));
    const response = await call(authorizeUrl(), {
      headers: { cookie: cookieValue(approvedCookie ?? "") },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location") ?? "").toContain(TEST_SETTINGS.authorizationUrl);
  });
});

describe("POST /authorize", () => {
  it("sends an approval to Access with PKCE and remembers the client", async () => {
    const { call } = await setup();
    const response = await approveFlow(call);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(TEST_SETTINGS.authorizationUrl);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/callback`);
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("__Host-kd_approved=");
    expect(cookies).toContain("__Host-kd_csrf=;");
  });

  it("refuses a form without a matching CSRF token", async () => {
    const { call } = await setup();
    const consent = await call(authorizeUrl());
    const html = await consent.text();
    const response = await call("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "approve",
        consent_id: inputValue(html, "consent_id"),
        csrf: "wrong",
      }),
    });
    expect(response.status).toBe(403);
  });

  it("returns access_denied to the client when the person cancels", async () => {
    const { call } = await setup();
    const consent = await call(authorizeUrl());
    const html = await consent.text();
    const response = await call("/authorize", {
      method: "POST",
      headers: {
        cookie: cookieValue(consent.headers.get("set-cookie")),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        action: "deny",
        consent_id: inputValue(html, "consent_id"),
        csrf: inputValue(html, "csrf"),
      }),
    });
    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe(CLIENT_REDIRECT);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("client-state");
  });

  it("rejects a reused consent id", async () => {
    const { call } = await setup();
    const consent = await call(authorizeUrl());
    const html = await consent.text();
    const send = () =>
      call("/authorize", {
        method: "POST",
        headers: {
          cookie: cookieValue(consent.headers.get("set-cookie")),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          action: "approve",
          consent_id: inputValue(html, "consent_id"),
          csrf: inputValue(html, "csrf"),
        }),
      });
    expect((await send()).status).toBe(302);
    expect((await send()).status).toBe(400);
  });
});

describe("GET /callback", () => {
  async function callbackFor(call: Awaited<ReturnType<typeof setup>>["call"]) {
    const approved = await approveFlow(call);
    const state = new URL(approved.headers.get("location") ?? "").searchParams.get("state") ?? "";
    return { state, response: await call(`/callback?code=access-code&state=${state}`) };
  }

  it("verifies the ID token and completes authorization with the Access subject", async () => {
    const { call, oauth } = await setup();
    const { response } = await callbackFor(call);
    expect(response.status).toBe(302);
    expect(response.headers.get("location") ?? "").toContain("code=issued-code");
    const [completed] = oauth.calls.completeAuthorization;
    expect(completed?.userId).toBe("access-user-123");
    expect(completed?.props).toMatchObject({
      email: "alice@example.com",
      sub: "access-user-123",
      clientId: KNOWN_CLIENT_ID,
    });
    expect(JSON.stringify(completed?.props)).not.toContain("id_token");
  });

  it("rejects a replayed state", async () => {
    const { call, oauth } = await setup();
    const { state } = await callbackFor(call);
    const replay = await call(`/callback?code=access-code&state=${state}`);
    expect(replay.status).toBe(400);
    expect(oauth.calls.completeAuthorization).toHaveLength(1);
  });

  it("refuses a token for another audience and never completes authorization", async () => {
    const key = await testSigningKey();
    const oauth = fakeOAuth();
    const fake = fakeFetch({
      [TEST_SETTINGS.jwksUrl]: () => Response.json(key.jwks),
      [TEST_SETTINGS.tokenUrl]: async () =>
        Response.json({
          id_token: await signJwt(
            key.privateKey,
            { alg: "RS256", kid: key.kid },
            idClaims(NOW_SECONDS, { aud: "another-app" }),
          ),
        }),
    });
    const handler = createAuthHandler({ fetch: fake.fetch, now: () => NOW_SECONDS * 1000 });
    const testEnv = { ...env, ...TEST_ENV_SETTINGS, OAUTH_PROVIDER: oauth.helpers };
    const call = (path: string, init?: RequestInit) =>
      handler.fetch(new Request(`${ORIGIN}${path}`, init), testEnv as never);
    const approved = await approveFlow(call);
    const state = new URL(approved.headers.get("location") ?? "").searchParams.get("state") ?? "";
    const response = await call(`/callback?code=access-code&state=${state}`);
    expect(response.status).toBe(403);
    expect(oauth.calls.completeAuthorization).toHaveLength(0);
  });
});

describe("setup and unknown routes", () => {
  it("explains which settings are missing without showing any value", async () => {
    const { call } = await setup({
      settings: { ACCESS_CLIENT_SECRET: undefined, ACCESS_JWKS_URL: undefined },
    });
    const response = await call(authorizeUrl());
    const html = await response.text();
    // 503, not 500: the deployment works, it is just not configured yet.
    expect(response.status).toBe(503);
    expect(html).toContain("ACCESS_CLIENT_SECRET");
    expect(html).toContain("ACCESS_JWKS_URL");
    expect(html).not.toContain(TEST_SETTINGS.clientSecret);
  });

  it("returns 404 for anything else", async () => {
    const { call } = await setup();
    expect((await call("/nope")).status).toBe(404);
  });
});
