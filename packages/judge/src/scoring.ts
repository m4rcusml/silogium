import type { ProblemDefinition } from "@silogium/core";
import type { CaseOutcome } from "./types.js";

export function scoreOutcomes(problem: ProblemDefinition, outcomes: CaseOutcome[]) {
  let score = 0;
  let maxScore = 0;
  for (const stage of problem.stages) {
    const cases = outcomes.filter((item) => item.stage === stage.number);
    if (!cases.length) continue;
    maxScore += stage.points;
    score += Math.round((cases.filter((item) => item.passed).length / cases.length) * stage.points);
  }
  return { score, maxScore };
}
