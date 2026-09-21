import type { IdentityClaims } from "./access";
import { readCookie, sign, verify } from "./cookies";

export const SESSION_COOKIE = "__Host-kd_session";
export const CLEAR_SESSION_COOKIE = `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

const MAX_AGE_SECONDS = 12 * 60 * 60;

/** Who is signed in to the browser pages. Never carries a token of any kind. */
export type Session = { sub: string; email: string; name: string; exp: number };

export async function sessionCookie(
  secret: string,
  identity: IdentityClaims,
  nowMs: number,
): Promise<string> {
  const session: Session = {
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    exp: Math.floor(nowMs / 1000) + MAX_AGE_SECONDS,
  };
  const value = await sign(secret, JSON.stringify(session));
  return `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

/** The signed-in identity, or null when the cookie is missing, forged or expired. */
export async function readSession(
  request: Request,
  secret: string,
  nowMs: number,
): Promise<Session | null> {
  const value = await verify(secret, readCookie(request, SESSION_COOKIE));
  if (value === null) return null;
  try {
    const session = JSON.parse(value) as Session;
    if (typeof session?.email !== "string" || typeof session?.exp !== "number") return null;
    return session.exp * 1000 > nowMs ? session : null;
  } catch {
    return null;
  }
}
