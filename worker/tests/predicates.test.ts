import { describe, expect, it } from "vitest";
import { memoryErrorCode } from "../src/memory/errors";
import { checkShape, parsePredicate, predicatesClosedBy } from "../src/policy/predicates";

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (err) {
    return memoryErrorCode(err);
  }
  return null;
}

const none = { validTo: null, reason: null };

describe("parsePredicate", () => {
  it("accepts known relationship types in any case", () => {
    expect(parsePredicate("has_vuln")).toBe("HAS_VULN");
  });

  it("rejects unknown relationship types", () => {
    expect(codeOf(() => parsePredicate("PWNED_BY"))).toBe("invalid_input");
  });
});

describe("checkShape", () => {
  it("allows asset HAS_VULN cve", () => {
    expect(() => checkShape("HAS_VULN", "asset", "cve", none)).not.toThrow();
  });

  it("allows asset HAS_VULN tenable-plugin", () => {
    expect(() => checkShape("HAS_VULN", "asset", "tenable-plugin", none)).not.toThrow();
  });

  it("rejects the wrong subject kind", () => {
    expect(codeOf(() => checkShape("HAS_VULN", "identity", "cve", none))).toBe("invalid_input");
  });

  it("rejects the wrong object kind", () => {
    expect(codeOf(() => checkShape("OWNS", "identity", "cve", none))).toBe("invalid_input");
  });

  it("requires an expiry and a reason for ACCEPTED_RISK", () => {
    expect(codeOf(() => checkShape("ACCEPTED_RISK", "asset", "cve", none))).toBe("invalid_input");
    expect(
      codeOf(() =>
        checkShape("ACCEPTED_RISK", "asset", "cve", {
          validTo: "2026-12-31T00:00:00.000Z",
          reason: null,
        }),
      ),
    ).toBe("invalid_input");
    expect(() =>
      checkShape("ACCEPTED_RISK", "asset", "cve", {
        validTo: "2026-12-31T00:00:00.000Z",
        reason: "WAF rule blocks the path",
      }),
    ).not.toThrow();
  });

  it("allows any kinds for RELATED_TO", () => {
    expect(() => checkShape("RELATED_TO", "ticket", "ioc-hash", none)).not.toThrow();
  });
});

describe("predicatesClosedBy", () => {
  it("REMEDIATED closes itself, HAS_VULN and ACCEPTED_RISK", () => {
    expect(predicatesClosedBy("REMEDIATED").sort()).toEqual(
      ["ACCEPTED_RISK", "HAS_VULN", "REMEDIATED"].sort(),
    );
  });

  it("HAS_VULN closes itself and REMEDIATED", () => {
    expect(predicatesClosedBy("HAS_VULN").sort()).toEqual(["HAS_VULN", "REMEDIATED"]);
  });

  it("OWNS closes only itself", () => {
    expect(predicatesClosedBy("OWNS")).toEqual(["OWNS"]);
  });
});
