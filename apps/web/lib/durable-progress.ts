import { createHash } from "node:crypto";
import type { Actor, ExecutionRequest, ExecutionResult, JudgeBundle, PracticeEvidence, ProblemDefinition } from "@silogium/core";

/** Server-only construction. Official status is an explicit deployment trust decision,
 * not inferred from HTTP success, a score, model output, or the client request.
 * Version 2+ stages require a reviewed stable-unit mapping; until that exists they
 * may complete the problem but cannot manufacture new stage rewards.
 */
export function executionEvidence(input: {
  actor: Actor; problem: ProblemDefinition; bundle: JudgeBundle; request: ExecutionRequest; result: ExecutionResult;
  persistent: boolean; trustedJudgePolicy?: string; occurredAt?: string;
}): PracticeEvidence {
  const { actor, problem, bundle, request, result } = input;
  const base: Omit<PracticeEvidence, "verification"> = {
    submissionId: result.id, userId: actor.id, problemId: problem.id, canonicalProblemId: problem.id,
    problemVersion: problem.version, runtime: request.runtime, occurredAt: input.occurredAt ?? new Date().toISOString(),
    kind: request.kind, verdict: result.verdict, purpose: "practice",
    problem: { format: problem.format, origin: problem.origin, visibility: problem.visibility,
      catalogReviewed: problem.visibility === "public" && problem.status === "published",
      ...(problem.provenance.kind === "native" ? { authorId: problem.provenance.createdBy, requestedBy: problem.provenance.assistedByAi ? problem.provenance.createdBy : undefined } : {}) }
  };
  if (!input.persistent || actor.id === "local-demo") return { ...base, verification: { kind: "demo" } };
  if (!input.trustedJudgePolicy) return { ...base, verification: { kind: "local" } };
  const allCases = [...bundle.visibleCases, ...bundle.hiddenCases];
  const expectedIds = new Set(allCases.map((test) => test.id));
  const resultIds = new Set(result.cases.map((test) => test.id));
  const unique = expectedIds.size === allCases.length && resultIds.size === result.cases.length;
  const knownStages = new Set(problem.stages.map((stage) => stage.number));
  const validSet = unique && result.cases.every((test) => expectedIds.has(test.id) && allCases.some((expected) => expected.id === test.id && expected.stage === test.stage));
  const bundleComplete = bundle.problemId === problem.id && bundle.problemVersion === problem.version
    && allCases.every((test) => knownStages.has(test.stage))
    && problem.stages.every((stage) => bundle.hiddenCases.some((test) => test.stage === stage.number));
  const stages = problem.stages.map((stage) => {
    const expected = allCases.filter((test) => test.stage === stage.number);
    const selected = request.kind === "submission" && (request.maxStage === undefined || stage.number <= request.maxStage);
    const fullyEvaluated = validSet && selected && expected.length > 0 && expected.every((test) => resultIds.has(test.id));
    return { number: stage.number, fullyEvaluated, passed: fullyEvaluated && expected.every((test) => result.cases.find((outcome) => outcome.id === test.id)?.passed === true),
      ...(problem.version === 1 ? { unitId: `initial-stage-${stage.number}` } : {}) };
  });
  return { ...base, verification: {
    kind: "official", judgePolicyVersion: input.trustedJudgePolicy,
    bundleRevision: createHash("sha256").update(JSON.stringify({ ...bundle, referenceSolutions: {} })).digest("hex"),
    bundleComplete, bundleReviewed: problem.status === "published" && problem.visibility === "public",
    scope: request.kind === "submission" && (request.maxStage === undefined || problem.stages.every((stage) => stage.number <= request.maxStage!)) ? "complete" : "partial",
    requiredStages: problem.stages.map((stage) => stage.number), stages
  } };
}
