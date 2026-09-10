import type { ExecutionResult, ProblemDefinition, Runtime } from "@silogium/core";

/** Capture when sending the request, not from controls that may change later. */
export type SubmissionContext = Readonly<{
  kind: "run" | "submission";
  runtime: Runtime;
  maxStage: number;
  scope: "official" | "visible" | "selected" | "custom";
}>;

export type SubmissionOutcome =
  | { kind: "none" }
  | { kind: "completed" | "practice_passed"; passedCases: number; stageCount: number };

const nonnegativeInteger = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Feedback for this response only. Not official evidence, a saved completion,
 * XP, or an achievement; persistence and judge trust are separate concerns.
 * Without the private bundle, stage coverage cannot prove the full case inventory.
 */
export function getSubmissionOutcome(problem: ProblemDefinition, context: SubmissionContext, result: ExecutionResult): SubmissionOutcome {
  if (!problem || !context || !result || result.verdict !== "accepted"
    || !["run", "submission"].includes(context.kind)
    || !["official", "visible", "selected", "custom"].includes(context.scope)
    || !Array.isArray(problem.stages) || !problem.stages.length || problem.stages.length > 4
    || !Array.isArray(problem.runtimes) || !problem.runtimes.some((runtime) => runtime.language === context.runtime)
    || !["typescript", "python"].includes(context.runtime)
    || !Number.isSafeInteger(context.maxStage) || context.maxStage < 1
    || typeof result.id !== "string" || !result.id.trim()
    || !nonnegativeInteger(result.score) || !nonnegativeInteger(result.maxScore)
    || result.score !== result.maxScore || !nonnegativeInteger(result.durationMs)
    || !Array.isArray(result.cases) || !result.cases.length) return { kind: "none" };

  if ((problem.format === "classic" && problem.stages.length !== 1)
    || (problem.format === "progressive" && problem.stages.length < 2)
    || !["classic", "progressive"].includes(problem.format)) return { kind: "none" };

  const pointsByStage = new Map<number, number>();
  let totalPoints = 0;
  for (const stage of problem.stages) {
    if (!stage || !Number.isSafeInteger(stage.number) || stage.number < 1
      || pointsByStage.has(stage.number) || !nonnegativeInteger(stage.points)) return { kind: "none" };
    pointsByStage.set(stage.number, stage.points);
    totalPoints += stage.points;
  }
  if (!nonnegativeInteger(totalPoints) || !pointsByStage.has(context.maxStage)) return { kind: "none" };

  const caseIds = new Set<string>();
  const coveredStages = new Set<number>();
  for (const test of result.cases) {
    if (!test || typeof test.id !== "string" || !test.id.trim() || caseIds.has(test.id)
      || test.passed !== true || test.mismatch !== undefined
      || !pointsByStage.has(test.stage) || test.stage > context.maxStage) return { kind: "none" };
    caseIds.add(test.id);
    coveredStages.add(test.stage);
  }

  // The judge awards stage points only for stages with evaluated cases. With
  // every case passing, both score fields must match that represented scope.
  const evaluatedPoints = [...coveredStages].reduce((total, stage) => total + pointsByStage.get(stage)!, 0);
  if (result.maxScore !== evaluatedPoints) return { kind: "none" };

  const counts = { passedCases: caseIds.size, stageCount: coveredStages.size };
  if (context.kind === "run") return { kind: "practice_passed", ...counts };
  if (context.scope !== "official" || context.maxStage !== Math.max(...pointsByStage.keys())
    || result.maxScore !== totalPoints || coveredStages.size !== pointsByStage.size) return { kind: "none" };
  return { kind: "completed", ...counts };
}
