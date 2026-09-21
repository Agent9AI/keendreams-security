import { describe, expect, it } from "vitest";
import { fuse, RRF_K } from "../src/search/rrf";

describe("reciprocal rank fusion", () => {
  it("ranks an item that both lists agree on above either list's favourite", () => {
    const fused = fuse([
      ["a", "shared", "b"],
      ["c", "shared", "d"],
    ]);
    expect(fused[0]?.id).toBe("shared");
    expect(fused.map((entry) => entry.id).sort()).toEqual(["a", "b", "c", "d", "shared"]);
  });

  it("scores by position with k = 60", () => {
    const [first] = fuse([["only"]]);
    expect(RRF_K).toBe(60);
    expect(first?.score).toBeCloseTo(1 / 61, 10);
  });

  it("keeps the first list's order when the other list is empty", () => {
    expect(fuse([["a", "b", "c"], []]).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores duplicates inside one list", () => {
    expect(fuse([["a", "a", "b"]]).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for no input", () => {
    expect(fuse([])).toEqual([]);
    expect(fuse([[], []])).toEqual([]);
  });
});
