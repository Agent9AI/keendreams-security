/** The usual constant from the reciprocal rank fusion paper. */
export const RRF_K = 60;

export type Fused = { id: string; score: number };

/**
 * Merges ranked lists so an item both searches found outranks an item only one
 * found. Only position matters, so a BM25 score and a cosine score never have to
 * be made comparable. Ties keep the order the lists first mentioned them in.
 */
export function fuse(lists: string[][], k: number = RRF_K): Fused[] {
  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));
}
