import { recommendPractice } from "@silogium/core";
import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";
import { loadPracticeHistory } from "@/lib/executions";
import { catalogProgressForProblem, summarizeCatalogProgress } from "@/lib/catalog-progress";
export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    const [catalog, history] = await Promise.all([getAuthoringRepository().listCatalog(), loadPracticeHistory(actor.id)]);
    const progress = summarizeCatalogProgress(history);
    const activity = catalog.map((problem) => ({ problemId: problem.id, progress: catalogProgressForProblem(problem, progress) }))
      .filter((item) => item.progress.status !== "not_started")
      .map((item) => ({ problemId: item.problemId, accepted: item.progress.status === "solved" }));
    const recommendations = recommendPractice(catalog, activity);
    return Response.json({ recommendations: recommendations.map(({ problem, reason }) => ({ id: problem.id, title: problem.title, slug: problem.slug, reason })) }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Não foi possível calcular recomendações. Seu progresso não foi alterado." }, { status: 503 }); }
}
