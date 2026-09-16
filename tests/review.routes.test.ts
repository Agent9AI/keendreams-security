import { reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { type AuthEnv, createAuthHandler } from "../src/auth/handler";
import { readSession, SESSION_COOKIE, sessionCookie } from "../src/auth/session";
import { isDemoMode } from "../src/web/demo";
import { TEST_ENV_SETTINGS, TEST_SETTINGS } from "./authFixtures";

afterEach(async () => {
  await reset();
});

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const IDENTITY = { sub: "access-user-1", email: "admin@example.com", name: "Ada Admin" };

function handler(now = NOW) {
  return createAuthHandler({
    fetch: async () => {
      throw new Error("no network in these tests");
    },
    now: () => now,
  });
}

function envWith(extra: Record<string, string> = {}): AuthEnv {
  return { ...env, ...TEST_ENV_SETTINGS, ...extra } as unknown as AuthEnv;
}

function get(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("demo mode is fenced to loopback", () => {
  const on = { DEMO_MODE: "on" };

  it("is off unless the deployer switched it on", () => {
    expect(isDemoMode({}, new URL("http://localhost:8788/review"))).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "off" }, new URL("http://localhost/review"))).toBe(false);
  });

  it("is on for loopback addresses", () => {
    expect(isDemoMode(on, new URL("http://localhost:8788/review"))).toBe(true);
    expect(isDemoMode(on, new URL("http://127.0.0.1:8788/review"))).toBe(true);
  });

  it("stays off on any deployed hostname even when switched on", () => {
    for (const host of [
      "https://memory.example.com/review",
      "https://keendreams.workers.dev/review",
      "https://localhost.example.com/review",
      "https://127.0.0.1.example.com/review",
    ]) {
      expect(isDemoMode(on, new URL(host))).toBe(false);
    }
  });
});

describe("the review page needs a signed-in browser", () => {
  it("sends an anonymous visitor to Cloudflare Access", async () => {
    const response = await handler().fetch(get("https://memory.example.com/review"), envWith());
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith(TEST_SETTINGS.authorizationUrl)).toBe(true);
    expect(new URL(location).searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("refuses a POST from an expired session instead of starting a sign-in", async () => {
    const response = await handler().fetch(
      new Request("https://memory.example.com/review?action=confirm", { method: "POST" }),
      envWith(),
    );
    expect(response.status).toBe(403);
  });

  it("does not accept a session cookie signed with another key", async () => {
    const forged = await sessionCookie("a-different-key-entirely-0123456789", IDENTITY, NOW);
    const value = forged.split(";")[0] ?? "";
    const response = await handler().fetch(
      get("https://memory.example.com/review", { cookie: value }),
      envWith(),
    );
    expect(response.status).toBe(302);
  });
});

describe("session cookies", () => {
  it("round-trips the identity and nothing else", async () => {
    const cookie = await sessionCookie(TEST_SETTINGS.cookieKey, IDENTITY, NOW);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");

    const value = cookie.split(";")[0] ?? "";
    const session = await readSession(
      get("https://memory.example.com/review", { cookie: value }),
      TEST_SETTINGS.cookieKey,
      NOW,
    );
    expect(session?.email).toBe(IDENTITY.email);
    expect(JSON.stringify(session)).not.toContain(TEST_SETTINGS.cookieKey);
  });

  it("expires", async () => {
    const cookie = await sessionCookie(TEST_SETTINGS.cookieKey, IDENTITY, NOW);
    const value = cookie.split(";")[0] ?? "";
    const request = get("https://memory.example.com/review", { cookie: value });
    const later = NOW + 13 * 60 * 60 * 1000;
    expect(await readSession(request, TEST_SETTINGS.cookieKey, later)).toBeNull();
  });
});

describe("demo mode end to end", () => {
  const demoEnv = () => envWith({ DEMO_MODE: "on" });

  it("signs a visitor in, seeds evidence and lists real proposals", async () => {
    const first = await handler().fetch(get("http://localhost:8788/review"), demoEnv());
    expect(first.status).toBe(302);
    const setCookie = first.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE);

    const cookie = setCookie.split(";")[0] ?? "";
    const page = await handler().fetch(get("http://localhost:8788/review", { cookie }), demoEnv());
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Review queue");
    expect(html).toContain("Demo mode");
    expect(html).toContain("asset:web-prod-03");
    expect(html).toContain("UNCONFIRMED");
  });

  it("will not confirm without a matching CSRF token", async () => {
    const first = await handler().fetch(get("http://localhost:8788/review"), demoEnv());
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    await handler().fetch(get("http://localhost:8788/review", { cookie }), demoEnv());

    const body = new URLSearchParams({ csrf: "not-the-token", fact_id: "whatever" });
    const response = await handler().fetch(
      new Request("http://localhost:8788/review?action=confirm", {
        method: "POST",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
      demoEnv(),
    );
    expect(response.status).toBe(403);
  });
});
