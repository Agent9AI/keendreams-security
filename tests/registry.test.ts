import { describe, expect, it } from "vitest";
import { memoryErrorCode } from "../src/memory/errors";
import { freshRegistry } from "./helpers";

const ADMIN = "admin@example.com";
const BOT = {
  principalEmail: "sync@example.com",
  oauthClientId: "client-sync",
  source: "tenable-hexa",
};

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (err) {
    return memoryErrorCode(err);
  }
  return null;
}

describe("single-team mode", () => {
  it("starts in single mode, unconfirmed, with a default client", async () => {
    const registry = freshRegistry();
    expect(await registry.modeState()).toEqual({ mode: "single", confirmed: false });
    expect((await registry.listClients()).map((client) => client.slug)).toEqual(["default"]);
  });

  it("gives every signed-in user member access to the default client", async () => {
    const registry = freshRegistry();
    expect(await registry.resolveAccess({ email: "Alice@Example.com", isAdmin: false })).toEqual({
      slug: "default",
      role: "member",
    });
    expect(await registry.resolveAccess({ email: ADMIN, isAdmin: true })).toEqual({
      slug: "default",
      role: "admin",
    });
  });

  it("uses reviewer roles set by an admin", async () => {
    const registry = freshRegistry();
    await registry.setMember(ADMIN, "rita@example.com", "default", "reviewer");
    expect(await registry.resolveAccess({ email: "rita@example.com", isAdmin: false })).toEqual({
      slug: "default",
      role: "reviewer",
    });
  });

  it("refuses any other client name", async () => {
    const registry = freshRegistry();
    expect(
      await codeOf(
        registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "acme" }),
      ),
    ).toBe("forbidden_client");
  });
});

describe("multi-client mode", () => {
  async function multi() {
    const registry = freshRegistry();
    expect(await registry.setMode(ADMIN, "multi")).toEqual({ mode: "multi", confirmed: true });
    await registry.createClient(ADMIN, "acme", "Acme Corp");
    await registry.setMember(ADMIN, "alice@example.com", "acme", "member");
    return registry;
  }

  it("requires a client", async () => {
    const registry = await multi();
    expect(
      await codeOf(registry.resolveAccess({ email: "alice@example.com", isAdmin: false })),
    ).toBe("invalid_input");
  });

  it("allows members and refuses everyone else", async () => {
    const registry = await multi();
    expect(
      await registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "acme" }),
    ).toEqual({ slug: "acme", role: "member" });
    expect(
      await codeOf(
        registry.resolveAccess({ email: "bob@example.com", isAdmin: false, client: "acme" }),
      ),
    ).toBe("forbidden_client");
    expect(
      await codeOf(
        registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "nope" }),
      ),
    ).toBe("forbidden_client");
  });

  it("gives admins every existing client and a clear error for unknown ones", async () => {
    const registry = await multi();
    expect(await registry.resolveAccess({ email: ADMIN, isAdmin: true, client: "acme" })).toEqual({
      slug: "acme",
      role: "admin",
    });
    expect(
      await codeOf(registry.resolveAccess({ email: ADMIN, isAdmin: true, client: "nope" })),
    ).toBe("not_found");
  });

  it("stops access when a member is removed", async () => {
    const registry = await multi();
    expect(await registry.removeMember(ADMIN, "alice@example.com", "acme")).toBe(true);
    expect(
      await codeOf(
        registry.resolveAccess({ email: "alice@example.com", isAdmin: false, client: "acme" }),
      ),
    ).toBe("forbidden_client");
  });
});

describe("clients", () => {
  it("validates slugs and rejects duplicates", async () => {
    const registry = freshRegistry();
    expect(await codeOf(registry.createClient(ADMIN, "Bad Slug", "x"))).toBe("invalid_input");
    expect(await codeOf(registry.createClient(ADMIN, "-acme", "x"))).toBe("invalid_input");
    await registry.createClient(ADMIN, "acme", "Acme");
    expect(await codeOf(registry.createClient(ADMIN, "acme", "Acme again"))).toBe("invalid_input");
  });
});

describe("source allowlist", () => {
  it("matches the exact principal, OAuth client and source", async () => {
    const registry = freshRegistry();
    const rule = { clientSlug: "default", ...BOT };
    expect(await registry.isAllowlisted(rule)).toBe(false);
    await registry.allowSource(ADMIN, rule);
    expect(await registry.isAllowlisted(rule)).toBe(true);
    expect(await registry.isAllowlisted({ ...rule, source: "pasted-chat" })).toBe(false);
    expect(await registry.isAllowlisted({ ...rule, oauthClientId: "other-client" })).toBe(false);
    expect(await registry.listAllowRules("default")).toEqual([rule]);
    expect(await registry.revokeSource(ADMIN, rule)).toBe(true);
    expect(await registry.isAllowlisted(rule)).toBe(false);
  });

  it("refuses rules for unknown clients", async () => {
    const registry = freshRegistry();
    expect(await codeOf(registry.allowSource(ADMIN, { clientSlug: "nope", ...BOT }))).toBe(
      "not_found",
    );
  });
});

describe("write limits", () => {
  it("defaults to 120 per minute and accepts 1 to 10,000", async () => {
    const registry = freshRegistry();
    expect(await registry.writeLimit("default")).toBe(120);
    expect(await registry.setWriteLimit(ADMIN, "default", 30)).toBe(30);
    expect(await registry.writeLimit("default")).toBe(30);
    expect(await codeOf(registry.setWriteLimit(ADMIN, "default", 0))).toBe("invalid_input");
    expect(await codeOf(registry.setWriteLimit(ADMIN, "default", 10_001))).toBe("invalid_input");
  });
});

describe("registry audit", () => {
  it("records admin changes in a verifiable chain", async () => {
    const registry = freshRegistry();
    await registry.setMode(ADMIN, "multi");
    await registry.createClient(ADMIN, "acme", "Acme");
    await registry.allowSource(ADMIN, { clientSlug: "acme", ...BOT });
    expect(await registry.verifyAuditChain()).toEqual({ ok: true, rows: 3 });
  });

  it("requires a valid actor email", async () => {
    const registry = freshRegistry();
    expect(await codeOf(registry.createClient("not-an-email", "acme", "Acme"))).toBe(
      "invalid_input",
    );
  });
});
