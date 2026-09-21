import { describe, expect, it } from "vitest";
import { memoryErrorCode } from "../src/memory/errors";
import { parseKey } from "../src/memory/keys";

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (err) {
    return memoryErrorCode(err);
  }
  return null;
}

describe("parseKey", () => {
  it("uppercases CVE ids", () => {
    expect(parseKey("cve:cve-2026-1234")).toEqual({
      kind: "cve",
      value: "CVE-2026-1234",
      key: "cve:CVE-2026-1234",
    });
  });

  it("lowercases and trims assets", () => {
    expect(parseKey("asset:  WEB-PROD-03 ").key).toBe("asset:web-prod-03");
  });

  it("accepts cloud resource paths as assets", () => {
    expect(parseKey("asset:arn:aws:ec2:us-east-1:123456789012:instance/i-0abc").kind).toBe("asset");
  });

  it("keeps Tenable plugin ids as digits", () => {
    expect(parseKey("tenable-plugin:201455").key).toBe("tenable-plugin:201455");
  });

  it("normalizes domains and strips a trailing dot", () => {
    expect(parseKey("ioc-domain:Bad.Example.").key).toBe("ioc-domain:bad.example");
  });

  it("accepts md5, sha1 and sha256 hashes", () => {
    for (const len of [32, 40, 64]) {
      expect(parseKey(`ioc-hash:${"A".repeat(len)}`).value).toBe("a".repeat(len));
    }
  });

  it("accepts IPv4 and IPv6 addresses", () => {
    expect(parseKey("ioc-ip:203.0.113.7").value).toBe("203.0.113.7");
    expect(parseKey("ioc-ip:2001:DB8::1").value).toBe("2001:db8::1");
  });

  it("lowercases identities", () => {
    expect(parseKey("identity:J.Doe@Example.com").key).toBe("identity:j.doe@example.com");
  });

  it("rejects unknown kinds", () => {
    expect(codeOf(() => parseKey("host:web-01"))).toBe("invalid_input");
  });

  it("rejects keys without a kind", () => {
    expect(codeOf(() => parseKey("web-prod-03"))).toBe("invalid_input");
  });

  it("rejects malformed CVE ids", () => {
    expect(codeOf(() => parseKey("cve:2026-1234"))).toBe("invalid_input");
  });

  it("rejects non-numeric plugin ids", () => {
    expect(codeOf(() => parseKey("tenable-plugin:abc"))).toBe("invalid_input");
  });

  it("rejects out-of-range IPv4 octets", () => {
    expect(codeOf(() => parseKey("ioc-ip:300.1.1.1"))).toBe("invalid_input");
  });
});

describe("memoryErrorCode", () => {
  it("returns null for errors without a known code prefix", () => {
    expect(memoryErrorCode(new Error("boom"))).toBeNull();
    expect(memoryErrorCode("not an error")).toBeNull();
  });
});
