import type { SearchBackend, VectorHit, VectorItem } from "../src/search/backend";

export type FakeBackend = SearchBackend & {
  readonly upserted: VectorItem[];
  readonly embedded: string[];
  failNext(count: number): void;
};

type FakeOptions = {
  /** Maps a Vectorize namespace to the ids it should match, best first. */
  hits?: Record<string, string[]>;
  suggestion?: string;
  suggestModel?: string | null;
};

/** Deterministic stand-in for Workers AI and Vectorize. No network, no randomness. */
export function fakeBackend(options: FakeOptions = {}): FakeBackend {
  const upserted: VectorItem[] = [];
  const embedded: string[] = [];
  let failures = 0;

  const vector = (text: string) => {
    const values: number[] = new Array(768).fill(0);
    for (let index = 0; index < text.length; index++) {
      const slot = text.charCodeAt(index) % 768;
      values[slot] = (values[slot] ?? 0) + 1;
    }
    return values;
  };

  return {
    upserted,
    embedded,
    suggestModel: options.suggestModel === undefined ? "fake-model" : options.suggestModel,

    failNext(count: number) {
      failures = count;
    },

    async embed(texts: string[]) {
      if (failures > 0) {
        failures -= 1;
        throw new Error("unavailable: fake embedding outage");
      }
      embedded.push(...texts);
      return texts.map(vector);
    },

    async upsert(items: VectorItem[]) {
      if (failures > 0) {
        failures -= 1;
        throw new Error("unavailable: fake index outage");
      }
      upserted.push(...items);
    },

    async query(_vector: number[], namespace: string, topK: number): Promise<VectorHit[]> {
      const ids = options.hits?.[namespace] ?? options.hits?.default ?? [];
      return ids.slice(0, topK).map((id, index) => ({ id, score: 1 - index * 0.01 }));
    },

    async deleteByIds() {},

    async suggest() {
      if (options.suggestion === undefined) throw new Error("unavailable: fake model outage");
      return options.suggestion;
    },
  };
}
