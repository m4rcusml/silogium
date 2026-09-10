import { getActor } from "@/lib/actor";
import { readPersonal } from "@/lib/personal";
import { loadPracticeHistory } from "@/lib/executions";
import { getAuthoringRepository } from "@/lib/authoring";
import { catalogProgressForProblem, summarizeCatalogProgress } from "@/lib/catalog-progress";
export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    const [state, history] = await Promise.all([readPersonal(actor), loadPracticeHistory(actor.id)]);
    const repository = getAuthoringRepository();
    const simulations = await Promise.all(state.simulations.map(async (simulation) => {
      const finish = Date.parse(simulation.finishedAt ?? simulation.endsAt);
      const attempts = history.filter((item) => item.request.kind === "submission" && item.result.verdict !== "system_error" && simulation.problemIds.includes(item.request.problemId)
        && item.request.problemVersion === simulation.versions[item.request.problemId] && Date.parse(item.createdAt) >= Date.parse(simulation.startedAt) && Date.parse(item.createdAt) <= finish);
      const progress = summarizeCatalogProgress(attempts);
      const completed = await Promise.all(simulation.problemIds.map(async (problemId) => {
        const value = await repository.getPackageVersion(problemId, simulation.versions[problemId]!, actor);
        return Boolean(value && catalogProgressForProblem(value.problem, progress).status === "solved");
      }));
      return { ...simulation, completed: completed.filter(Boolean).length,
        attempts: attempts.length, active: !simulation.finishedAt && Date.now() < finish };
    }));
    return Response.json({ simulations }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Não foi possível carregar os simulados." }, { status: 503 }); }
}
