import { describe, expect, it } from "vitest";
import {
  APPROVED_COOKIE,
  approvedClients,
  approvedClientsCookie,
  CSRF_COOKIE,
  csrfMatches,
  newCsrfToken,
  readCookie,
  sign,
  verify,
} from "../src/auth/cookies";

const SECRET = "s".repeat(64);

function withCookie(cookie: string): Request {
  return new Request("https://memory.example.com/authorize", { headers: { cookie } });
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

describe("sign and verify", () => {
  it("round-trips a value", async () => {
    expect(await verify(SECRET, await sign(SECRET, "hello"))).toBe("hello");
  });

  it("rejects tampering, the wrong secret and malformed input", async () => {
    const signed = await sign(SECRET, "hello");
    const [, signature] = signed.split(".");
    const forgedPayload = `${btoa("goodbye").replace(/=+$/, "")}.${signature}`;
    expect(await verify(SECRET, forgedPayload)).toBeNull();
    expect(await verify("x".repeat(64), signed)).toBeNull();
    expect(await verify(SECRET, "no-dot")).toBeNull();
    expect(await verify(SECRET, null)).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie(withCookie("a=1; b=two=2; c=3"), "b")).toBe("two=2");
    expect(readCookie(withCookie("a=1"), "missing")).toBeNull();
  });
});

describe("approved clients cookie", () => {
  it("is host-only, secure, HTTP-only and lax", async () => {
    const cookie = await approvedClientsCookie(withCookie(""), SECRET, "client-1");
    expect(cookie.startsWith(`${APPROVED_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("accumulates unique client ids and keeps the latest 20", async () => {
    let cookie = "";
    for (let i = 0; i < 22; i++) {
      cookie = cookieValue(await approvedClientsCookie(withCookie(cookie), SECRET, `client-${i}`));
    }
    cookie = cookieValue(await approvedClientsCookie(withCookie(cookie), SECRET, "client-21"));
    const ids = await approvedClients(withCookie(cookie), SECRET);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("client-2");
    expect(ids.at(-1)).toBe("client-21");
  });

  it("ignores a cookie signed with another secret", async () => {
    const cookie = cookieValue(
      await approvedClientsCookie(withCookie(""), "y".repeat(64), "client-1"),
    );
    expect(await approvedClients(withCookie(cookie), SECRET)).toEqual([]);
  });
});

describe("CSRF", () => {
  it("matches only when the form token equals the cookie token", () => {
    const { token, cookie } = newCsrfToken();
    expect(cookie.startsWith(`${CSRF_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("SameSite=Strict");
    const request = withCookie(cookieValue(cookie));
    expect(csrfMatches(request, token)).toBe(true);
    expect(csrfMatches(request, `${token.slice(0, -1)}x`)).toBe(false);
    expect(csrfMatches(request, null)).toBe(false);
    expect(csrfMatches(withCookie(""), token)).toBe(false);
  });
});
