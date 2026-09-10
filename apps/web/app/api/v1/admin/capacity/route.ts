import { getActor } from "@/lib/actor";
import { getOperationalAvailability, setOperationalPaused } from "@/lib/operational-capacity";

const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  if (request.headers.has("authorization")) return Response.json({ error: "Gerencie os serviços pela sessão do navegador, não por token da CLI." }, { status: 403, headers });
  try {
    const actor = await getActor(request);
    if (actor.role !== "admin") return Response.json({ error: "Somente administradores podem gerenciar a capacidade." }, { status: 403, headers });
    return Response.json(await getOperationalAvailability(), { headers });
  } catch { return Response.json({ error: "Não foi possível conferir a capacidade." }, { status: 403, headers }); }
}

export async function PATCH(request: Request) {
  if (request.headers.has("authorization")) return Response.json({ error: "Gerencie os serviços pela sessão do navegador, não por token da CLI." }, { status: 403, headers });
  try {
    const actor = await getActor(request);
    if (actor.role !== "admin") return Response.json({ error: "Somente administradores podem gerenciar a capacidade." }, { status: 403, headers });
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origem do pedido não autorizada." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Envie os dados em JSON.");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Informe a alteração.");
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_024) { await reader.cancel(); throw new Error("Pedido muito grande."); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Alteração inválida.");
    const input = value as Record<string, unknown>;
    if ((input.service !== "groq" && input.service !== "modal") || typeof input.paused !== "boolean") throw new Error("Escolha o serviço e uma pausa válida.");
    return Response.json(await setOperationalPaused(actor, input.service, input.paused), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a disponibilidade." }, { status: 400, headers });
  }
}
