import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { memoryErrorCode } from "../src/memory/errors";
import {
  backendFromEnv,
  DEFAULT_SUGGEST_MODEL,
  EMBEDDING_DIMENSIONS,
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
