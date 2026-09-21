import { MemoryError } from "../memory/errors";

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_SUGGEST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
/** bge handles about 512 tokens; longer text is truncated before embedding. */
export const EMBED_CHARS = 1500;

export type SearchEnv = Partial<Pick<Env, "AI" | "VECTORS">> & { SUGGEST_MODEL?: string };

export type VectorItem = { id: string; values: number[]; namespace: string };
export type VectorHit = { id: string; score: number };

export type SearchBackend = {
  /** Null when the deployer turned suggestions off. */
  readonly suggestModel: string | null;
  embed(texts: string[]): Promise<number[][]>;
  upsert(items: VectorItem[]): Promise<void>;
  query(vector: number[], namespace: string, topK: number): Promise<VectorHit[]>;
  deleteByIds(ids: string[]): Promise<void>;
  suggest(prompt: string, schema: Record<string, unknown>): Promise<string>;
};

/**
 * Turns any binding failure into `unavailable` so callers can fall back.
 * The underlying message can name internal infrastructure, so it is logged
 * in the deployer's own account and never returned to a caller.
 */
function unavailable(what: string, error: unknown): MemoryError {
  console.error(`keendreams search: ${what} failed`, error);
  return new MemoryError("unavailable", `${what} is not available right now`);
}

/**
 * The text of a Workers AI text-generation result.
 *
 * The shape depends on the request. A plain chat returns `response` as a string.
 * With a JSON schema requested, models such as llama-3.3-70b return `response`
 * already parsed into an object, and the raw text in the chat completion's
 * `choices[0].message.content`. Accept all three rather than treating a
 * perfectly good answer as missing.
 */
export function modelText(result: unknown): string {
  if (typeof result === "string") return result;
  const body = (result ?? {}) as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
  };
  if (typeof body.response === "string") return body.response;
  if (typeof body.response === "object" && body.response !== null) {
    return JSON.stringify(body.response);
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  throw new MemoryError("unavailable", "the model returned no text");
}

/**
 * The suggestion model is chosen by the deployer at runtime, so its name is a
 * plain string rather than one of the generated model literals. This narrow
 * view of the binding keeps that one dynamic call readable.
 */
type DynamicAi = { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };

export function backendFromEnv(env: SearchEnv): SearchBackend | null {
  const ai = env.AI;
  const vectors = env.VECTORS;
  if (!ai || !vectors) return null;
  const configured = (env.SUGGEST_MODEL ?? "").trim();
  const suggestModel = configured === "off" ? null : configured || DEFAULT_SUGGEST_MODEL;

  return {
    suggestModel,

    async embed(texts) {
      try {
        const result = await ai.run(EMBEDDING_MODEL, {
          text: texts.map((text) => text.slice(0, EMBED_CHARS)),
        });
        const data = (result as { data?: number[][] }).data;
        if (!Array.isArray(data) || data.length !== texts.length) {
          throw new Error(`expected ${texts.length} embeddings`);
        }
        return data;
      } catch (error) {
        throw unavailable("the embedding model", error);
      }
    },

    async upsert(items) {
      if (items.length === 0) return;
      try {
        await vectors.upsert(items);
      } catch (error) {
        throw unavailable("the vector index", error);
      }
    },

    async query(vector, namespace, topK) {
      try {
        const matches = await vectors.query(vector, { topK, namespace });
        return matches.matches.map((match) => ({ id: match.id, score: match.score }));
      } catch (error) {
        throw unavailable("the vector index", error);
      }
    },

    async deleteByIds(ids) {
      if (ids.length === 0) return;
      try {
        await vectors.deleteByIds(ids);
      } catch (error) {
        throw unavailable("the vector index", error);
      }
    },

    async suggest(prompt, schema) {
      if (suggestModel === null) {
        throw new MemoryError("unavailable", "suggestions are turned off for this deployment");
      }
      try {
        const result = await (ai as unknown as DynamicAi).run(suggestModel, {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1024,
          temperature: 0,
          response_format: { type: "json_schema", json_schema: schema },
        });
        return modelText(result);
      } catch (error) {
        if (error instanceof MemoryError) throw error;
        throw unavailable("the suggestion model", error);
      }
    },
  };
}
