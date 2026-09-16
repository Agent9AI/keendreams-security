import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { type AuthEnv, createAuthHandler } from "../src/auth/handler";
import { SETTING_NAMES } from "../src/config";
import { setupPage } from "../src/web/setup";
import { TEST_ENV_SETTINGS } from "./authFixtures";

const ORIGIN = "https://memory.example.com";

/** Builds a page from the settings that ARE set, which is what the page reads. */
function page(present: Partial<Record<(typeof SETTING_NAMES)[number], string>> = {}) {
  return setupPage(present, ORIGIN, SETTING_NAMES);
}

const ALL_SET = {
  ACCESS_CLIENT_ID: "id",
  ACCESS_CLIENT_SECRET: "secret",
  ACCESS_AUTHORIZATION_URL: "https://example.com/authorization",
  ACCESS_TOKEN_URL: "https://example.com/token",
  ACCESS_JWKS_URL: "https://example.com/jwks",
  COOKIE_ENCRYPTION_KEY: "k".repeat(64),
  ADMIN_EMAILS: "you@example.com",
};

describe("the setup page guides rather than just reporting", () => {
  it("shows the callback URL the deployer must paste into Access", async () => {
    const html = await page().text();
    expect(html).toContain(`${ORIGIN}/callback`);
  });

  it("gives the exact command for each missing setting", async () => {
    const html = await page().text();
    expect(html).toContain("npx wrangler secret put ACCESS_CLIENT_ID");
    expect(html).toContain("npx wrangler secret put ACCESS_TOKEN_URL");
  });

  it("tells the deployer to generate the cookie key instead of typing one", async () => {
    const html = await page().text();
    expect(html).toContain("openssl rand -hex 32");
    // A generated secret must never also be offered as a paste prompt.
    const prompts = html.match(/npx wrangler secret put COOKIE_ENCRYPTION_KEY/g) ?? [];
    expect(prompts).toHaveLength(1);
    expect(html).toContain("openssl rand -hex 32 | npx wrangler secret put COOKIE_ENCRYPTION_KEY");
  });

  it("reports progress so a half-finished setup is obvious", async () => {
    expect(await page().text()).toContain("0 of 7 settings in place");
    const { ACCESS_CLIENT_ID: _omitted, ...allButOne } = ALL_SET;
    expect(await page(allButOne).text()).toContain("6 of 7 settings in place");
    expect(await page(ALL_SET).text()).toContain("7 of 7 settings in place");
  });

  it("points at the demo for anyone who just wants to look", async () => {
    expect(await page().text()).toContain("npm run demo");
  });

  it("answers 503, because this is a service that is not ready yet", () => {
    expect(page().status).toBe(503);
  });

  it("never renders a setting's value, only whether it is present", async () => {
    const html = await page(TEST_ENV_SETTINGS).text();
    for (const secret of Object.values(TEST_ENV_SETTINGS)) {
      expect(html).not.toContain(secret);
    }
  });
});

describe("the Worker serves it when sign-in is not configured", () => {
  it("shows the guide instead of an error on the review page", async () => {
    const handler = createAuthHandler({
      fetch: async () => {
        throw new Error("no network");
      },
      now: () => Date.parse("2026-09-16T12:00:00.000Z"),
    });
    const response = await handler.fetch(new Request(`${ORIGIN}/review`), {
      ...env,
    } as unknown as AuthEnv);
    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain("Almost there");
    expect(html).toContain(`${ORIGIN}/callback`);
  });
});
