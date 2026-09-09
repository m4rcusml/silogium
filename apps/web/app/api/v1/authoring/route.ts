import { ContentRequestSchema } from "@silogium/core";
import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";
import { consumeQuota } from "@/lib/usage";

export async function POST(request: Request) {
  try {
    const actor = await getActor(request);
    const raw = await request.json() as Record<string, unknown>;
    const input = ContentRequestSchema.parse(raw);
    if (input.mode === "create" && input.visibility === "public" && raw.licensesAccepted !== true) {
      throw new Error("Aceite as licenças CC BY 4.0 e MIT antes de solicitar publicação.");
    }
    const quota = await consumeQuota(actor.id, "ai");
    if (!quota.allowed) return Response.json({ error: "Sua cota diária de IA terminou. Tente novamente amanhã." }, { status: 429 });
    return Response.json(await getAuthoringModule().request(input, actor), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 });
  }
}
