import { describe, expect, it } from "vitest";
import { type AppSettings, adminEmails, readAccessSettings, SetupError } from "../src/config";

const BASE = "https://team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/abc123";

function settings(overrides: AppSettings = {}): AppSettings {
  return {
    ACCESS_CLIENT_ID: "abc123",
    ACCESS_CLIENT_SECRET: ["test", "client", "secret"].join("-"),
    ACCESS_AUTHORIZATION_URL: `${BASE}/authorization`,
    ACCESS_TOKEN_URL: `${BASE}/token`,
    ACCESS_JWKS_URL: `${BASE}/jwks`,
    COOKIE_ENCRYPTION_KEY: "k".repeat(64),
    ADMIN_EMAILS: "admin@example.com",
    ...overrides,
  };
}

function setupErrorOf(fn: () => unknown): SetupError {
  try {
    fn();
  } catch (err) {
    if (err instanceof SetupError) return err;
    throw err;
  }
  throw new Error("expected a SetupError");
}

describe("readAccessSettings", () => {
  it("reads settings and derives the issuer from the token URL", () => {
    const access = readAccessSettings(settings());
    expect(access.issuer).toBe(BASE);
    expect(access.clientId).toBe("abc123");
    expect(access.jwksUrl).toBe(`${BASE}/jwks`);
  });

  it("prefers an explicit issuer when Access reports a different one", () => {
    const access = readAccessSettings(
      settings({ ACCESS_ISSUER: "https://team.cloudflareaccess.com" }),
    );
    expect(access.issuer).toBe("https://team.cloudflareaccess.com");
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_ISSUER: "http://team.example" })),
    );
    expect(err.missing).toEqual(["ACCESS_ISSUER"]);
  });

  it("lists every missing setting without echoing values", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_CLIENT_ID: "", ACCESS_JWKS_URL: undefined })),
    );
    expect(err.missing).toEqual(["ACCESS_CLIENT_ID", "ACCESS_JWKS_URL"]);
    expect(err.message).not.toContain("test-client-secret");
  });

  it("rejects endpoints that are not https", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_TOKEN_URL: "http://team.example/token" })),
    );
    expect(err.missing).toEqual(["ACCESS_TOKEN_URL"]);
  });

  it("requires the token URL to end with /token", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ ACCESS_TOKEN_URL: `${BASE}/oauth` })),
    );
    expect(err.missing).toEqual(["ACCESS_TOKEN_URL"]);
  });

  it("requires a cookie key of at least 32 characters", () => {
    const err = setupErrorOf(() =>
      readAccessSettings(settings({ COOKIE_ENCRYPTION_KEY: "short" })),
    );
    expect(err.missing).toEqual(["COOKIE_ENCRYPTION_KEY"]);
  });
});

describe("adminEmails", () => {
  it("parses a comma-separated list, lowercases it and drops invalid entries", () => {
    expect([
      ...adminEmails({ ADMIN_EMAILS: " A@Example.com, b@example.com ,, not-an-email" }),
    ]).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns an empty set when unset", () => {
    expect(adminEmails({}).size).toBe(0);
  });
});
