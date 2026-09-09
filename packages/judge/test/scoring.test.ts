import { describe, expect, it } from "vitest";
import { seedProblems } from "@silogium/core";
import { scoreOutcomes } from "../src/scoring.js";

describe("scoreOutcomes", () => {
  it("pontua cada estágio de forma independente", () => {
    const result = scoreOutcomes(seedProblems[0]!, [
      { id: "a", name: "A", stage: 1, passed: true },
      { id: "b", name: "B", stage: 1, passed: false },
      { id: "c", name: "C", stage: 2, passed: true }
    ]);
    expect(result).toEqual({ score: 225, maxScore: 300 });
  });
});
