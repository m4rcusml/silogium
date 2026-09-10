import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    // No request body: confirmation always applies to the persisted, previously shown request.
    return Response.json(await getAuthoringModule().confirmCreation(id, actor), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o pedido." }, { status: 400 });
  }
}
