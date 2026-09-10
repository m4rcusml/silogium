import { createJudgeFromEnv, type Judge } from "@silogium/judge";
import type { ExecutionRequest, JudgeBundle, ProblemDefinition } from "@silogium/core";
import { finishModalReservation, reserveModalCapacity } from "./operational-capacity";

/** Conservative reservation includes sandbox preparation, not only candidate CPU time.
 * Rates are ceilings pinned for this beta, not a price oracle. Native no-charge cap is mandatory.
 */
export function modalReservationMicrousd(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest) {
  const cases = (request.kind === "run" ? bundle.visibleCases : [...bundle.visibleCases, ...bundle.hiddenCases])
    .filter(item => request.maxStage === undefined || item.stage <= request.maxStage).length;
  const memoryGib = (problem.limits?.memoryMiB ?? 256) / 1024;
  // Sandbox: <=1 CPU, 30 seconds lifetime, requested RAM; generous controller/transport allowance.
  return Math.ceil(cases * 30 * (40 + memoryGib * 7) + 3_000);
}

export function getPlatformJudge(): Judge {
  const delegate = createJudgeFromEnv();
  if (!process.env.MODAL_JUDGE_ENDPOINT) return delegate;
  return {
    async evaluate(problem, bundle, request) {
      const id = crypto.randomUUID();
      await reserveModalCapacity(id, modalReservationMicrousd(problem, bundle, request));
      try { return await delegate.evaluate(problem, bundle, request); }
      finally {
        try { await finishModalReservation(id); } catch { /* Full reservation persists safely; reporting can recover. */ }
      }
    }
  };
}
