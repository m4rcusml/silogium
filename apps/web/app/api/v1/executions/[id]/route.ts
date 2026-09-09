import { getActor } from "@/lib/actor";
import { getExecution } from "@/lib/executions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    const execution = await getExecution(actor.id, id, actor.role === "admin");
    return execution ? Response.json(execution) : Response.json({ error: "Execução não encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
