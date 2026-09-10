import { getActor, getOptionalActor } from "@/lib/actor";
import { contribute, listCommunity, moderateContribution, reportContribution } from "@/lib/community";

export async function GET(request: Request, context: { params: Promise<{ problemId: string }> }) {
  try {
    const actor = await getOptionalActor(request);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("Versão inválida.");
    return Response.json({ posts: await listCommunity((await context.params).problemId, version, actor), canContribute: Boolean(actor) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Comunidade indisponível." }, { status: 404 }); }
}
export async function POST(request: Request, context: { params: Promise<{ problemId: string }> }) {
  try {
    const actor = await getActor(request);
    const { problemId } = await context.params;
    const body = await request.json();
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw new Error("Versão inválida.");
    if (body.action === "report") { await reportContribution(problemId, body.version, String(body.postId), actor, String(body.reason ?? "")); return Response.json({ ok: true }); }
    if (body.action === "remove") { await moderateContribution(String(body.postId), actor, "remove", "", body.expectedUpdatedAt, { problemId, version: body.version }); return Response.json({ ok: true }); }
    return Response.json(await contribute(problemId, body.version, actor, body.content, typeof body.postId === "string" ? body.postId : undefined, body.expectedUpdatedAt), { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Falha ao salvar contribuição."; return Response.json({ error: message }, { status: message.startsWith("CONFLICT:") ? 409 : 400 }); }
}
