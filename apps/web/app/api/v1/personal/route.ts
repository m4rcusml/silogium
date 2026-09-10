import { PersonalActionSchema } from "@silogium/core";
import { getActor } from "@/lib/actor";
import { changePersonal, personalProblems, readPersonal } from "@/lib/personal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    const state = await readPersonal(actor);
    const problems = await personalProblems(actor, [...state.favorites, ...state.lists.flatMap((list) => list.problemIds), ...state.simulations.flatMap((simulation) => simulation.problemIds)]);
    return Response.json({ state, mode: createSupabaseAdminClient() ? "persistent" : "demo", handle: actor.handle, problems: [...problems.values()].map(({ id, slug, title, version, difficulty, tags }) => ({ id, slug, title, version, difficulty, tags })) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar sua biblioteca." }, { status: 403 }); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await getActor(request);
    const body = await request.json();
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new Error("Revisão inválida.");
    const state = await changePersonal(actor, body.expectedRevision, PersonalActionSchema.parse(body.action));
    return Response.json({ state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar.";
    return Response.json({ error: message }, { status: message.startsWith("CONFLICT:") ? 409 : 400 });
  }
}
