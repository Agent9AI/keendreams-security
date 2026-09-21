import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { AccessSettings } from "../config";
import { fromBase64Url, toBase64Url } from "./encoding";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A sign-in failure whose message is safe to show; it never includes tokens or secrets. */
export class AccessError extends Error {
  constructor(detail: string) {
    super(`Access sign-in failed: ${detail}`);
    this.name = "AccessError";
  }
}

/** `oauthRequest` drives an MCP authorization; `returnTo` drives a browser sign-in. */
export type UpstreamState = {
  oauthRequest?: AuthRequest;
  returnTo?: string;
  codeVerifier: string;
};
export type IdentityClaims = { sub: string; email: string; name: string };

const CLOCK_SKEW_SECONDS = 60;

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(digest) };
}

export function accessAuthorizeUrl(
  settings: AccessSettings,
  params: { redirectUri: string; state: string; challenge: string },
): string {
  const url = new URL(settings.authorizationUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: settings.clientId,
    redirect_uri: params.redirectUri,
    scope: "openid email profile",
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeCode(
  fetchFn: FetchLike,
  settings: AccessSettings,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<string> {
  if (!params.code) {
    throw new AccessError("the sign-in response had no code");
  }
  let response: Response;
  try {
    response = await fetchFn(settings.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code: params.code,
        code_verifier: params.codeVerifier,
        redirect_uri: params.redirectUri,
      }).toString(),
    });
  } catch {
    throw new AccessError("could not reach the Access token endpoint");
  }
  if (!response.ok) {
    throw new AccessError(`the Access token endpoint returned ${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!body || typeof body.id_token !== "string") {
    throw new AccessError("the Access token response had no id_token");
  }
  return body.id_token;
}

function decodePart(part: string): Record<string, unknown> {
  try {
    const value = JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
    if (typeof value !== "object" || value === null) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AccessError("the ID token is malformed");
  }
}

async function signingKey(
  fetchFn: FetchLike,
  settings: AccessSettings,
  kid: string,
): Promise<CryptoKey> {
  let jwks: { keys?: (JsonWebKey & { kid?: string })[] };
  try {
    const response = await fetchFn(settings.jwksUrl, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`status ${response.status}`);
    jwks = (await response.json()) as typeof jwks;
  } catch {
    throw new AccessError("could not load the Access signing keys");
  }
  const jwk = jwks.keys?.find((key) => key.kid === kid && key.kty === "RSA");
  if (!jwk) {
    throw new AccessError("the ID token was signed by an unknown key");
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function verifyIdToken(
  fetchFn: FetchLike,
  settings: AccessSettings,
  idToken: string,
  nowSeconds: number,
): Promise<IdentityClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new AccessError("the ID token is malformed");
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodePart(headerPart);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new AccessError("the ID token must be RS256 with a key id");
  }

  const key = await signingKey(fetchFn, settings, header.kid);
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = fromBase64Url(signaturePart);
  } catch {
    throw new AccessError("the ID token is malformed");
  }
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) {
    throw new AccessError("the ID token signature is invalid");
  }

  const claims = decodePart(payloadPart);
  if (claims.iss !== settings.issuer) {
    throw new AccessError("the ID token issuer does not match this Access app");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(settings.clientId)) {
    throw new AccessError("the ID token audience does not match this Access app");
  }
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds) {
    throw new AccessError("the ID token has expired");
  }
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new AccessError("the ID token was issued in the future");
  }
  if (typeof claims.sub !== "string" || claims.sub === "") {
    throw new AccessError("the ID token has no subject");
  }
  if (typeof claims.email !== "string" || !claims.email.includes("@")) {
    throw new AccessError("the ID token has no email; enable the email scope on the Access app");
  }
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : "",
  };
}
