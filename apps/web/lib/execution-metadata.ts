type ProblemMetadata = { id: string; title: string; slug: string; version: number };

/** History remains useful even when a problem or its private bundle is unavailable. */
export async function attachExecutionProblemMetadata<T extends { request: { problemId: string } }>(
  executions: T[],
  loadProblem: (id: string) => Promise<ProblemMetadata | null | undefined>
): Promise<Array<T & { problem?: ProblemMetadata }>> {
  const ids = [...new Set(executions.map((execution) => execution.request.problemId))];
  const resolved = await Promise.allSettled(ids.map(loadProblem));
  const accessible = new Map(ids.map((id, index) => {
    const result = resolved[index];
    return [id, result?.status === "fulfilled" ? result.value : undefined] as const;
  }));
  return executions.map((execution) => {
    const problem = accessible.get(execution.request.problemId);
    return { ...execution, ...(problem ? { problem: { id: problem.id, title: problem.title, slug: problem.slug, version: problem.version } } : {}) };
  });
}
