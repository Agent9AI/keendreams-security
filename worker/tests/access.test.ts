import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  AccessError,
  accessAuthorizeUrl,
  exchangeCode,
  pkcePair,
  verifyIdToken,
} from "../src/auth/access";
import { toBase64Url } from "../src/auth/encoding";
import { putOnce, takeOnce } from "../src/auth/onceStore";
import { fakeFetch, idClaims, signJwt, TEST_SETTINGS, testSigningKey } from "./authFixtures";

const NOW = 1_789_000_000;

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AccessError) return err.message;
    throw err;
  }
  throw new Error("expected an AccessError");
}

describe("pkcePair", () => {
  it("derives an S256 challenge from a 43-character verifier", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    expect(challenge).toBe(toBase64Url(digest));
  });
});

describe("accessAuthorizeUrl", () => {
  it("sends the user to Access with PKCE and the OIDC scopes", () => {
    const url = new URL(
      accessAuthorizeUrl(TEST_SETTINGS, {
        redirectUri: "https://memory.example.com/callback",
        state: "state-token",
        challenge: "challenge-value",
      }),
    );
    expect(url.origin + url.pathname).toBe(TEST_SETTINGS.authorizationUrl);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "test-client",
      redirect_uri: "https://memory.example.com/callback",
      scope: "openid email profile",
      state: "state-token",
      code_challenge: "challenge-value",
      code_challenge_method: "S256",
    });
  });
});

describe("exchangeCode", () => {
  it("posts the code with PKCE and client credentials and returns the ID token", async () => {
    const fake = fakeFetch({
      [TEST_SETTINGS.tokenUrl]: () => Response.json({ id_token: "header.payload.signature" }),
    });
    const idToken = await exchangeCode(fake.fetch, TEST_SETTINGS, {
      code: "auth-code",
      codeVerifier: "verifier",
      redirectUri: "https://memory.example.com/callback",
    });
    expect(idToken).toBe("header.payload.signature");
    const body = new URLSearchParams(String(fake.calls[0]?.init?.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      client_id: "test-client",
      client_secret: TEST_SETTINGS.clientSecret,
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: "https://memory.example.com/callback",
    });
  });

  it("fails clearly on errors without exposing the response", async () => {
    const params = { code: "c", codeVerifier: "v", redirectUri: "https://m.example.com/callback" };
    const denied = fakeFetch({
      [TEST_SETTINGS.tokenUrl]: () => new Response("nope", { status: 401 }),
    });
    expect(await rejection(exchangeCode(denied.fetch, TEST_SETTINGS, params))).toContain(
      "returned 401",
    );
    const empty = fakeFetch({ [TEST_SETTINGS.tokenUrl]: () => Response.json({}) });
    expect(await rejection(exchangeCode(empty.fetch, TEST_SETTINGS, params))).toContain(
      "no id_token",
    );
    const offline = fakeFetch({});
    expect(await rejection(exchangeCode(offline.fetch, TEST_SETTINGS, params))).toContain(
      "could not reach",
    );
    expect(
      await rejection(exchangeCode(offline.fetch, TEST_SETTINGS, { ...params, code: "" })),
    ).toContain("no code");
  });
});

describe("verifyIdToken", () => {
  async function setup() {
    const key = await testSigningKey();
    const fake = fakeFetch({ [TEST_SETTINGS.jwksUrl]: () => Response.json(key.jwks) });
    const token = (payload: object, header: object = { alg: "RS256", kid: key.kid }) =>
      signJwt(key.privateKey, header, payload);
    return { key, fake, token };
  }

  it("returns the identity for a valid token", async () => {
    const { fake, token } = await setup();
    const claims = await verifyIdToken(fake.fetch, TEST_SETTINGS, await token(idClaims(NOW)), NOW);
    expect(claims).toEqual({
      sub: "access-user-123",
      email: "alice@example.com",
      name: "Alice Analyst",
    });
  });

  it("accepts an audience array that includes the client id", async () => {
    const { fake, token } = await setup();
    const jwt = await token(idClaims(NOW, { aud: ["other", TEST_SETTINGS.clientId] }));
    await expect(verifyIdToken(fake.fetch, TEST_SETTINGS, jwt, NOW)).resolves.toMatchObject({
      sub: "access-user-123",
    });
  });

  it("rejects the wrong audience, issuer, expiry and issue time", async () => {
    const { fake, token } = await setup();
    const check = async (overrides: Record<string, unknown>) =>
      rejection(
        verifyIdToken(fake.fetch, TEST_SETTINGS, await token(idClaims(NOW, overrides)), NOW),
      );
    expect(await check({ aud: "someone-else" })).toContain("audience");
    expect(await check({ iss: "https://evil.example" })).toContain("issuer");
    expect(await check({ exp: NOW - 120 })).toContain("expired");
    expect(await check({ iat: NOW + 3600 })).toContain("future");
    expect(await check({ email: undefined })).toContain("no email");
    expect(await check({ sub: "" })).toContain("no subject");
  });

  it("rejects tokens signed by another key or with another algorithm", async () => {
    const { fake, key, token } = await setup();
    const other = await testSigningKey(key.kid);
    const forged = await signJwt(other.privateKey, { alg: "RS256", kid: key.kid }, idClaims(NOW));
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, forged, NOW))).toContain(
      "signature",
    );
    const hs = await token(idClaims(NOW), { alg: "HS256", kid: key.kid });
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, hs, NOW))).toContain("RS256");
    const unknownKid = await token(idClaims(NOW), { alg: "RS256", kid: "unknown" });
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, unknownKid, NOW))).toContain(
      "unknown key",
    );
    expect(await rejection(verifyIdToken(fake.fetch, TEST_SETTINGS, "not-a-jwt", NOW))).toContain(
      "malformed",
    );
  });

  it("fails when the signing keys cannot be loaded", async () => {
    const { token } = await setup();
    const offline = fakeFetch({
      [TEST_SETTINGS.jwksUrl]: () => new Response("down", { status: 503 }),
    });
    const jwt = await token(idClaims(NOW));
    expect(await rejection(verifyIdToken(offline.fetch, TEST_SETTINGS, jwt, NOW))).toContain(
      "signing keys",
    );
  });
});

describe("onceStore", () => {
  it("returns a stored value exactly once", async () => {
    const id = await putOnce(env.OAUTH_KV, "test", { hello: "world" });
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await takeOnce(env.OAUTH_KV, "test", id)).toEqual({ hello: "world" });
    expect(await takeOnce(env.OAUTH_KV, "test", id)).toBeNull();
  });

  it("ignores missing or malformed ids", async () => {
    expect(await takeOnce(env.OAUTH_KV, "test", null)).toBeNull();
    expect(await takeOnce(env.OAUTH_KV, "test", "../../etc")).toBeNull();
  });
});
