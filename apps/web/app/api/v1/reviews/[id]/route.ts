import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    const { decision, reason } = await request.json() as { decision: "approve" | "reject"; reason?: string };
    if (!new Set(["approve", "reject"]).has(decision)) throw new Error("Decisão inválida.");
    return Response.json(await getAuthoringRepository().moderate(id, decision, actor, reason));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 });
  }
}
