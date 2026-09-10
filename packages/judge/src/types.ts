import type { ExecutionRequest, ExecutionResult, JudgeBundle, ProblemDefinition } from "@silogium/core";

export interface Judge {
  evaluate(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest): Promise<ExecutionResult>;
}

export type CaseOutcome = ExecutionResult["cases"][number];
