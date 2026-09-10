import { parseAuthoringRequest } from "@silogium/authoring";
import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";
import { requireBetaAccess } from "@/lib/beta";
import { withExecutionActor } from "@/lib/operational-capacity";
import { requestFailure } from "@/lib/request-failure";

export async function POST(request: Request) {
  try {
    const actor = await getActor(request);
    await requireBetaAccess(actor);
    const raw = await request.json() as Record<string, unknown>;
    const input = parseAuthoringRequest(raw);
    if (input.mode === "create" && input.visibility === "public" && raw.licensesAccepted !== true) {
      throw new Error("Aceite as licenças CC BY 4.0 e MIT antes de solicitar publicação.");
    }
    return Response.json(await withExecutionActor(actor, () => getAuthoringModule().request(input, actor)), { status: 202 });
  } catch (error) {
    return requestFailure(error, "Pedido inválido.");
  }
}
