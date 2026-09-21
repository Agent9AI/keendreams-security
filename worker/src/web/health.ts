import { backendFromEnv, EMBEDDING_DIMENSIONS, type SearchEnv } from "../search/backend";

export type Check = {
  name: string;
  /** `offline` is demo mode only: the probe exists but cannot run on a laptop. */
  state: "ok" | "failed" | "absent" | "offline";
  detail: string;
};

export type HealthEnv = SearchEnv & { OAUTH_KV?: KVNamespace };

/** A vector of the right shape, used only to prove the index answers. */
function probeVector(): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(0);
}

function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 160 ? `${message.slice(0, 160)}...` : message;
}

/**
 * Proves the deployment's bindings actually answer, rather than that they were
 * declared. Every probe is a read or a throwaway write, so running this is safe
 * on a live deployment. The point is that a deployer finds out here rather than
 * from a tool call failing in front of an analyst.
 */
export async function runChecks(env: HealthEnv): Promise<Check[]> {
  const checks: Check[] = [];

  if (!env.OAUTH_KV) {
    checks.push({ name: "Workers KV", state: "absent", detail: "No OAUTH_KV binding." });
  } else {
    try {
      await env.OAUTH_KV.get("health-probe");
      checks.push({
        name: "Workers KV",
        state: "ok",
        detail: "Reachable. Holds OAuth grants and short-lived sign-in state.",
      });
    } catch (error) {
      checks.push({ name: "Workers KV", state: "failed", detail: reason(error) });
    }
  }

  const backend = backendFromEnv(env);

  if (!env.VECTORS) {
    checks.push({
      name: "Vectorize",
      state: "absent",
      detail: "No VECTORS binding. Recall still answers, using keyword search only.",
    });
  } else if (!backend) {
    checks.push({
      name: "Vectorize",
      state: "absent",
      detail: "Present, but Workers AI is missing, so semantic search cannot run.",
    });
  } else {
    try {
      const matches = await backend.query(probeVector(), "health-probe", 1);
      checks.push({
        name: "Vectorize",
        state: "ok",
        detail: `Index answered. ${matches.length} match in an empty probe namespace, which is expected.`,
      });
    } catch (error) {
      checks.push({
        name: "Vectorize",
        state: "failed",
        detail: `${reason(error)} Recall falls back to keyword search.`,
      });
    }
  }

  if (!env.AI) {
    checks.push({
      name: "Workers AI (embeddings)",
      state: "absent",
      detail: "No AI binding. Recall runs keyword only and suggestions are unavailable.",
    });
  } else if (!backend) {
    checks.push({ name: "Workers AI (embeddings)", state: "absent", detail: "Not configured." });
  } else {
    try {
      const [vector] = await backend.embed(["keendreams health probe"]);
      const size = vector?.length ?? 0;
      checks.push({
        name: "Workers AI (embeddings)",
        state: size === EMBEDDING_DIMENSIONS ? "ok" : "failed",
        detail:
          size === EMBEDDING_DIMENSIONS
            ? `Returned ${size} dimensions, matching the index.`
            : `Returned ${size} dimensions but the index expects ${EMBEDDING_DIMENSIONS}.`,
      });
    } catch (error) {
      checks.push({ name: "Workers AI (embeddings)", state: "failed", detail: reason(error) });
    }
  }

  const model = backend?.suggestModel ?? null;
  if (!backend) {
    checks.push({
      name: "Workers AI (suggestions)",
      state: "absent",
      detail: "Needs both the AI and Vectorize bindings.",
    });
  } else if (model === null) {
    checks.push({
      name: "Workers AI (suggestions)",
      state: "absent",
      detail: "Turned off by SUGGEST_MODEL=off. suggest_facts returns unavailable.",
    });
  } else {
    try {
      const raw = await backend.suggest(
        'Reply with this exact JSON and nothing else: {"facts": []}',
        { type: "object", properties: { facts: { type: "array" } }, required: ["facts"] },
      );
      const parsed = JSON.parse(raw) as { facts?: unknown };
      checks.push({
        name: "Workers AI (suggestions)",
        state: Array.isArray(parsed.facts) ? "ok" : "failed",
        detail: Array.isArray(parsed.facts)
          ? `${model} returned schema-valid JSON.`
          : `${model} answered but not in the requested shape.`,
      });
    } catch (error) {
      checks.push({
        name: "Workers AI (suggestions)",
        state: "failed",
        detail: `${model}: ${reason(error)}`,
      });
    }
  }

  return checks;
}
