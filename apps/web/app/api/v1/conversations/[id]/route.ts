import { getActor } from "@/lib/actor";
import { getConversationRepository } from "@/lib/conversations";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    const repository = getConversationRepository();
    const conversation = await repository.get(id, actor);
    if (!conversation) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    const query = new URL(request.url).searchParams;
    return Response.json({ conversation, ...await repository.listTurns(id, actor, { cursor: query.get("cursor") ?? undefined, limit: query.has("limit") ? Number(query.get("limit")) : undefined }) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar a conversa." }, { status: 400 }); }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await getActor(request);
    await getConversationRepository().delete((await params).id, actor);
    return new Response(null, { status: 204 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a conversa." }, { status: 400 }); }
}
