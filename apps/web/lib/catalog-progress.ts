import type { ExecutionRequest, ExecutionResult, ProblemDefinition } from "@silogium/core";

type Activity = {
  request: Pick<ExecutionRequest, "kind" | "problemId" | "problemVersion">;
  result: Pick<ExecutionResult, "id" | "verdict" | "score" | "maxScore" | "cases">;
};
export type ProblemProgress = { status: "not_started" | "in_progress" | "solved"; best?: { score: number; maxScore: number } };
export type CatalogProgressEntry = {
  problemId: string;
  problemVersion: number;
  submissions: Array<{ stages: number[]; accepted: boolean; best?: { score: number; maxScore: number } }>;
};

/** Personal activity, not official recognition. Preserve each submission scope:
 * accepting separate partial submissions must never imply one full solve.
 * Only stage numbers and scores leave the server, never case content or evidence.
 */
export function summarizeCatalogProgress(items: readonly Activity[]): CatalogProgressEntry[] {
  const entries = new Map<string, CatalogProgressEntry>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.result.id) || item.result.verdict === "system_error") continue;
    seen.add(item.result.id);
    const key = `${item.request.problemId}:${item.request.problemVersion}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = { problemId: item.request.problemId, problemVersion: item.request.problemVersion, submissions: [] };
      entries.set(key, entry);
    }
    if (item.request.kind !== "submission") continue;
    const stages = [...new Set(item.result.cases.map((test) => test.stage))].sort((a, b) => a - b);
    const scopeKey = stages.join(",");
    let scope = entry.submissions.find((candidate) => candidate.stages.join(",") === scopeKey);
    if (!scope) { scope = { stages, accepted: false }; entry.submissions.push(scope); }
    scope.accepted ||= item.result.verdict === "accepted";
    if (item.result.maxScore > 0 && (!scope.best || item.result.score / item.result.maxScore > scope.best.score / scope.best.maxScore)) {
      scope.best = { score: item.result.score, maxScore: item.result.maxScore };
    }
  }
  return [...entries.values()];
}

export function catalogProgressForProblem(problem: Pick<ProblemDefinition, "id" | "version" | "stages">, entries: readonly CatalogProgressEntry[]): ProblemProgress {
  const entry = entries.find((candidate) => candidate.problemId === problem.id && candidate.problemVersion === problem.version);
  if (!entry) return { status: "not_started" };
  const full = entry.submissions.filter((scope) => problem.stages.every((stage) => scope.stages.includes(stage.number)));
  const best = full.flatMap((scope) => scope.best ? [scope.best] : []).sort((a, b) => b.score / b.maxScore - a.score / a.maxScore)[0];
  return { status: full.some((scope) => scope.accepted) ? "solved" : "in_progress", ...(best ? { best } : {}) };
}
