import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";
import { requireBetaAccess } from "@/lib/beta";
import { withExecutionActor } from "@/lib/operational-capacity";
import { requestFailure } from "@/lib/request-failure";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    await requireBetaAccess(actor);
    const { id } = await params;
    // No request body: confirmation always applies to the persisted, previously shown request.
    return Response.json(await withExecutionActor(actor, () => getAuthoringModule().confirmCreation(id, actor)), { status: 202 });
  } catch (error) {
    return requestFailure(error, "Não foi possível confirmar o pedido.");
  }
}
