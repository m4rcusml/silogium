import { getActor } from "@/lib/actor";
import { issueToken, listTokens, revokeToken } from "@/lib/tokens";

export async function GET(request: Request) {
  try { return Response.json({ tokens: await listTokens((await getActor(request)).id) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const { token, id, prefix, createdAt, expiresAt } = await issueToken((await getActor(request)).id);
    return Response.json({ token, id, prefix, createdAt, expiresAt }, { status: 201 });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 }); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await getActor(request);
    const { id } = await request.json();
    return await revokeToken(id, actor.id) ? new Response(null, { status: 204 }) : Response.json({ error: "Token não encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 }); }
}
