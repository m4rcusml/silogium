import { getActor } from "@/lib/actor";
import { getConversationRepository } from "@/lib/conversations";

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    const params = new URL(request.url).searchParams;
    return Response.json(await getConversationRepository().list(actor, { cursor: params.get("cursor") ?? undefined, limit: params.has("limit") ? Number(params.get("limit")) : undefined }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar as conversas." }, { status: 400 }); }
}
