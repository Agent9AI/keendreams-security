import { fromBase64Url, toBase64Url } from "./encoding";

export const APPROVED_COOKIE = "__Host-kd_approved";
export const CSRF_COOKIE = "__Host-kd_csrf";
export const CLEAR_CSRF_COOKIE = `${CSRF_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

const APPROVED_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_APPROVED_CLIENTS = 20;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function sign(secret: string, value: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(value));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the signed value, or null when it is missing, malformed or forged. */
export async function verify(
  secret: string,
  signed: string | null | undefined,
): Promise<string | null> {
  if (!signed) return null;
  const [payload, signature, extra] = signed.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    return valid ? new TextDecoder().decode(fromBase64Url(payload)) : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function approvedClients(request: Request, secret: string): Promise<string[]> {
  const value = await verify(secret, readCookie(request, APPROVED_COOKIE));
  if (!value) return [];
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function approvedClientsCookie(
  request: Request,
  secret: string,
  clientId: string,
): Promise<string> {
  const previous = (await approvedClients(request, secret)).filter((id) => id !== clientId);
  const ids = [...previous, clientId].slice(-MAX_APPROVED_CLIENTS);
  const value = await sign(secret, JSON.stringify(ids));
  return `${APPROVED_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${APPROVED_MAX_AGE_SECONDS}`;
}

export function newCsrfToken(): { token: string; cookie: string } {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return {
    token,
    cookie: `${CSRF_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`,
  };
}

export function csrfMatches(request: Request, formToken: unknown): boolean {
  const cookieToken = readCookie(request, CSRF_COOKIE);
  if (typeof formToken !== "string" || !cookieToken || formToken.length !== cookieToken.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < formToken.length; i++) {
    difference |= formToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }
  return difference === 0;
}
