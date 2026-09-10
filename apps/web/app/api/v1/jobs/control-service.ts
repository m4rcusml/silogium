import { getActor } from "@/lib/actor";
import { cancelBetaJob, resumeBetaJob } from "@/lib/beta";

export async function controlJob(request: Request, jobId: string, action: "cancel" | "resume") {
  if (request.headers.has("authorization")) return Response.json({ error: "Cancele ou retome pedidos pela sessão do navegador, não por token da CLI." }, { status: 403, headers: { "cache-control": "private, no-store" } });
  try {
    const actor = await getActor(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origem do pedido não autorizada." }, { status: 403 });
    if (!/^[A-Za-z0-9-]{1,128}$/.test(jobId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });
    const changed = await (action === "cancel" ? cancelBetaJob(actor, jobId) : resumeBetaJob(actor, jobId));
    if (!changed) return Response.json({ error: "Este pedido não pode ser alterado agora. Consulte seu estado antes de tentar novamente." }, { status: 409 });
    return Response.json({ jobId, action }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "statusCode" in error && error.statusCode === 403 ? 403 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o pedido." }, { status });
  }
}
