import { parseAuthoringRequest } from "@silogium/authoring";
import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";

export async function POST(request: Request) {
  try {
    const actor = await getActor(request);
    const raw = await request.json() as Record<string, unknown>;
    const input = parseAuthoringRequest(raw);
    if (input.mode === "create" && input.visibility === "public" && raw.licensesAccepted !== true) {
      throw new Error("Aceite as licenças CC BY 4.0 e MIT antes de solicitar publicação.");
    }
    return Response.json(await getAuthoringModule().request(input, actor), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 });
  }
}
