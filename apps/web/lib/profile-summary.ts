import type { ExecutionRequest, ExecutionResult, Runtime } from "@silogium/core";

type ProfileActivity = {
  request: Pick<ExecutionRequest, "kind" | "problemId" | "runtime">;
  result: Pick<ExecutionResult, "id" | "verdict">;
};

/** Describes a history window, never all-time progress or complete problem solves. */
export function summarizeProfileActivity(items: readonly ProfileActivity[]) {
  const distinct = [...new Map(items.map((item) => [item.result.id, item])).values()];
  const attempts = distinct.filter((item) => item.result.verdict !== "system_error");
  const submissions = attempts.filter((item) => item.request.kind === "submission");
  const languages: Array<{ runtime: Runtime; attempts: number }> = (["typescript", "python"] as const)
    .map((runtime) => ({ runtime, attempts: attempts.filter((item) => item.request.runtime === runtime).length }))
    .filter((language) => language.attempts > 0)
    .sort((left, right) => right.attempts - left.attempts);
  return {
    problemsPracticed: new Set(attempts.map((item) => item.request.problemId)).size,
    submissions: submissions.length,
    acceptedSubmissions: submissions.filter((item) => item.result.verdict === "accepted").length,
    runs: attempts.length - submissions.length,
    systemErrors: distinct.length - attempts.length,
    languages
  };
}
