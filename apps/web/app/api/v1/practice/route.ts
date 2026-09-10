import { getActor } from "@/lib/actor";
import { getPracticeOverview, updatePracticeSettings } from "@/lib/practice-repository";

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    return Response.json(await getPracticeOverview(actor.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar sua prática." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getActor(request);
    const text = await request.text();
    if (text.length > 2_048) throw new Error("Preferência muito longa.");
    const input = JSON.parse(text) as Record<string, unknown>;
    if (typeof input.timeZone !== "string" || !(input.goalDays === null || typeof input.goalDays === "number") || typeof input.showProgress !== "boolean") throw new Error("Preferências inválidas.");
    await updatePracticeSettings(actor.id, { timeZone: input.timeZone, goalDays: input.goalDays, showProgress: input.showProgress });
    return Response.json(await getPracticeOverview(actor.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar sua preferência." }, { status: 400 }); }
}
