import { describe, expect, it } from "vitest";
import { canReview, initialStatus } from "../src/policy/trust";

describe("initialStatus", () => {
  it("proposes MCP writes, whoever makes them", () => {
    expect(initialStatus("mcp")).toBe("proposed");
  });

  it("always proposes AI suggestions", () => {
    expect(initialStatus("ai_suggestion")).toBe("proposed");
  });

  it("trusts writes from an allowlisted source identity", () => {
    expect(initialStatus("allowlisted_source")).toBe("trusted");
  });
});

describe("canReview", () => {
  it("allows reviewers and admins in a browser", () => {
    expect(canReview("reviewer", "browser")).toBe(true);
    expect(canReview("admin", "browser")).toBe(true);
  });

  it("never allows review over MCP", () => {
    expect(canReview("admin", "mcp")).toBe(false);
    expect(canReview("reviewer", "mcp")).toBe(false);
  });

  it("does not allow members to review", () => {
    expect(canReview("member", "browser")).toBe(false);
  });
});
