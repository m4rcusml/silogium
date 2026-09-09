import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    const job = await getAuthoringModule().getJob(id, actor);
    if (!job) return Response.json({ error: "Job não encontrado." }, { status: 404 });
    const safeJob = job.result?.kind === "create"
      ? { ...job, result: { kind: "create", package: { problem: job.result.package.problem, validation: job.result.package.validation, accessKey: job.result.package.accessKey } } }
      : job;
    return Response.json(safeJob);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
