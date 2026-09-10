import { getActor } from "@/lib/actor";
import { getExecution } from "@/lib/executions";
import { getAuthoringRepository } from "@/lib/authoring";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    const execution = await getExecution(actor.id, id);
    if (!execution) return Response.json({ error: "Submissão não encontrada." }, { status: 404 });
    const problem = (await getAuthoringRepository().getPackageVersion(execution.request.problemId, execution.request.problemVersion, actor))?.problem;
    return Response.json({ ...execution, problem: problem ?? null,
      reopenUrl: problem ? `/problemas/${problem.slug}?version=${execution.request.problemVersion}&submission=${encodeURIComponent(id)}&runtime=${execution.request.runtime}` : null
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível abrir a submissão." }, { status: 400 }); }
}
