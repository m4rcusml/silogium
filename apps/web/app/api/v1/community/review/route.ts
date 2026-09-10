import { getActor } from "@/lib/actor";
import { communityReviewQueue, moderateContribution } from "@/lib/community";
export async function GET(request: Request) {
  try { return Response.json({ posts: await communityReviewQueue(await getActor(request)) }, { headers: { "cache-control": "private, no-store" } }); }
  catch { return Response.json({ error: "Revisão administrativa indisponível." }, { status: 403 }); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await getActor(request); const body = await request.json();
    if (!["approve", "reject", "remove"].includes(body.decision) || typeof body.postId !== "string") throw new Error("Decisão inválida.");
    await moderateContribution(body.postId, actor, body.decision, String(body.reason ?? ""), body.expectedUpdatedAt); return Response.json({ ok: true });
  } catch (error) { const message = error instanceof Error ? error.message : "Falha na revisão."; return Response.json({ error: message }, { status: message.startsWith("CONFLICT:") ? 409 : 403 }); }
}
