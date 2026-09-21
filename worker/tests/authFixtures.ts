import type { FetchLike } from "../src/auth/access";
import { toBase64Url } from "../src/auth/encoding";
import type { AccessSettings } from "../src/config";

const BASE = "https://team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/test-client";

export const TEST_SETTINGS: AccessSettings = {
  clientId: "test-client",
  clientSecret: ["test", "client", "secret"].join("-"),
  authorizationUrl: `${BASE}/authorization`,
  tokenUrl: `${BASE}/token`,
  jwksUrl: `${BASE}/jwks`,
  issuer: BASE,
  cookieKey: "c".repeat(64),
};

/** The same values as `TEST_SETTINGS`, in the shape the Worker reads from its environment. */
export const TEST_ENV_SETTINGS = {
  ACCESS_CLIENT_ID: TEST_SETTINGS.clientId,
  ACCESS_CLIENT_SECRET: TEST_SETTINGS.clientSecret,
  ACCESS_AUTHORIZATION_URL: TEST_SETTINGS.authorizationUrl,
  ACCESS_TOKEN_URL: TEST_SETTINGS.tokenUrl,
  ACCESS_JWKS_URL: TEST_SETTINGS.jwksUrl,
  COOKIE_ENCRYPTION_KEY: TEST_SETTINGS.cookieKey,
  ADMIN_EMAILS: "admin@example.com",
};

/** A fresh RSA signing key and matching JWKS, generated per test run. */
export async function testSigningKey(kid = "test-key") {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return {
    kid,
    privateKey: pair.privateKey,
    jwks: { keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] },
  };
}

export async function signJwt(
  privateKey: CryptoKey,
  header: object,
  payload: object,
): Promise<string> {
  const encode = (value: object) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(signature)}`;
}

export type FetchCall = { url: string; init?: RequestInit };

/** An offline fetch that answers only the routes it was given and records every call. */
export function fakeFetch(
  routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
) {
  const calls: FetchCall[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch to ${url}`);
    return route(init);
  };
  return { fetch: fn, calls };
}

export function idClaims(nowSeconds: number, overrides: Record<string, unknown> = {}) {
  return {
    iss: TEST_SETTINGS.issuer,
    aud: TEST_SETTINGS.clientId,
    sub: "access-user-123",
    email: "Alice@Example.com",
    name: "Alice Analyst",
    iat: nowSeconds,
    exp: nowSeconds + 600,
    ...overrides,
  };
}
