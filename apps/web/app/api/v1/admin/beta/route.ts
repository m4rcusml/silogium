import { getActor } from "@/lib/actor";
import { listBetaParticipants, updateBetaParticipant } from "@/lib/beta";

const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  if (request.headers.has("authorization")) return Response.json({ error: "Gerencie o beta pela sessão do navegador, não por token da CLI." }, { status: 403, headers });
  try {
    const actor = await getActor(request);
    if (actor.role !== "admin") return Response.json({ error: "Somente administradores podem gerenciar o beta." }, { status: 403, headers });
    return Response.json(await listBetaParticipants(actor), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar a lista." }, { status: 403, headers });
  }
}

export async function PATCH(request: Request) {
  if (request.headers.has("authorization")) return Response.json({ error: "Gerencie o beta pela sessão do navegador, não por token da CLI." }, { status: 403, headers });
  try {
    const actor = await getActor(request);
    if (actor.role !== "admin") return Response.json({ error: "Somente administradores podem gerenciar o beta." }, { status: 403, headers });
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return Response.json({ error: "Origem do pedido não autorizada." }, { status: 403, headers });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Envie os dados em JSON.");
    // Read a bounded body before parsing, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Informe a decisão.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_048) { await reader.cancel(); throw new Error("Pedido muito grande."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const input: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Decisão inválida.");
    const value = input as Record<string, unknown>;
    if (value.action === "invite" && typeof value.githubHandle === "string") {
      await updateBetaParticipant(actor, { action: "invite", githubHandle: value.githubHandle.trim().replace(/^@/, "") });
    } else if (value.action === "revoke_invite" && typeof value.githubId === "string" && /^\d{1,24}$/.test(value.githubId)) {
      await updateBetaParticipant(actor, { action: "revoke_invite", githubId: value.githubId });
    } else if ((value.action === "approve" || value.action === "reject" || value.action === "revoke") && typeof value.userId === "string" && value.userId.length <= 128) {
      await updateBetaParticipant(actor, { action: value.action, userId: value.userId });
    } else throw new Error("Escolha uma decisão e uma pessoa válidas.");
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o acesso." }, { status: 400, headers });
  }
}
