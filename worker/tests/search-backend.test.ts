import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { memoryErrorCode } from "../src/memory/errors";
import {
  backendFromEnv,
  DEFAULT_SUGGEST_MODEL,
  EMBEDDING_DIMENSIONS,
  modelText,
  type SearchEnv,
} from "../src/search/backend";

const real = env as unknown as SearchEnv;

describe("backendFromEnv", () => {
  it("returns null when the deployment has no AI or Vectorize binding", () => {
    expect(backendFromEnv({} as SearchEnv)).toBeNull();
    expect(backendFromEnv({ AI: real.AI } as SearchEnv)).toBeNull();
  });

  it("uses the deployer's model override and honours off", () => {
    expect(backendFromEnv(real)?.suggestModel).toBe(DEFAULT_SUGGEST_MODEL);
    const overridden = backendFromEnv({ ...real, SUGGEST_MODEL: "@cf/meta/llama-3.2-3b-instruct" });
    expect(overridden?.suggestModel).toBe("@cf/meta/llama-3.2-3b-instruct");
    expect(backendFromEnv({ ...real, SUGGEST_MODEL: "off" })?.suggestModel).toBeNull();
  });

  // This calls the real AI binding, which cannot run locally, so miniflare logs
  // "Binding AI needs to be run remotely" and an unhandled rejection from its own
  // proxy client. Both lines are expected: the point of the test is that a binding
  // nobody can reach surfaces as `unavailable` rather than as a crash.
  it("reports a binding that cannot run locally as unavailable, not as a crash", async () => {
    const backend = backendFromEnv(real);
    expect(backend).not.toBeNull();
    const failure = await backend?.embed(["web-prod-03"]).catch((error: unknown) => error);
    expect(memoryErrorCode(failure)).toBe("unavailable");
    expect(String((failure as Error).message)).not.toContain("remotely");
  });

  it("agrees with the index the deployer is told to create", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });
});

describe("reading text out of a Workers AI response", () => {
  // Shapes captured from @cf/meta/llama-3.3-70b-instruct-fp8-fast on a real
  // account. With a JSON schema requested, `response` arrives already parsed.
  it("accepts a plain string response", () => {
    expect(modelText({ response: "ok" })).toBe("ok");
  });

  it("accepts a response the model already parsed as JSON", () => {
    const text = modelText({ response: { facts: [] }, choices: [] });
    expect(JSON.parse(text)).toEqual({ facts: [] });
  });

  it("falls back to the chat completion message content", () => {
    const text = modelText({
      choices: [{ message: { content: '{"facts": []}' } }],
    });
    expect(text).toBe('{"facts": []}');
  });

  it("reports a response with no text as unavailable", () => {
    expect(memoryErrorCode(captureError(() => modelText({})))).toBe("unavailable");
    expect(memoryErrorCode(captureError(() => modelText({ response: null })))).toBe("unavailable");
  });
});

function backendReturning(result: unknown) {
  if (!real.AI || !real.VECTORS) throw new Error("Test bindings are unavailable");
  const ai = new Proxy(real.AI, {
    get(target, property) {
      return property === "run" ? async () => result : Reflect.get(target, property);
    },
  });
  const backend = backendFromEnv({ AI: ai, VECTORS: real.VECTORS });
  if (!backend) throw new Error("Test backend is unavailable");
  return backend;
}

describe("embedding response validation", () => {
  const vector = () => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.125);

  it("accepts a complete batch of finite vectors with the configured dimensions", async () => {
    const data = [vector(), vector()];
    await expect(backendReturning({ data }).embed(["first", "second"])).resolves.toEqual(data);
  });

  it.each([
    ["null vector", null],
    ["string vector", "invalid"],
    ["empty vector", []],
    ["short vector", vector().slice(1)],
    ["long vector", [...vector(), 0]],
    ["non-finite number", [...vector().slice(1), Number.NaN]],
    ["infinity", [...vector().slice(1), Number.POSITIVE_INFINITY]],
    ["numeric string", [...vector().slice(1), "0.125"]],
    ["missing values", new Array(EMBEDDING_DIMENSIONS)],
  ])("rejects a %s as unavailable", async (_name, value) => {
    const failure = await backendReturning({ data: [value] })
      .embed(["evidence"])
      .catch((error: unknown) => error);
    expect(memoryErrorCode(failure)).toBe("unavailable");
  });

  it("rejects the whole batch when any vector is malformed", async () => {
    await expect(
      backendReturning({ data: [vector(), []] }).embed(["first", "second"]),
    ).rejects.toThrow("unavailable");
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}
