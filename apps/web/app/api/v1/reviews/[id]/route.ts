import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";
import { editorialError, getEditorial, readEditorialBody } from "../../problems/[slug]/editorial/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    if (actor.role !== "admin") throw new Error("Somente administradores podem inspecionar a revisão.");
    const { id } = await params;
    const repository = getAuthoringRepository();
    const value = (await repository.listPending(actor)).find((item) => item.editorialReview?.id === id);
    if (!value) return Response.json({ error: "Revisão pendente não encontrada." }, { status: 404 });
    const previous = value.problem.version > 1 ? await repository.getPackageVersion(value.problem.id, value.problem.version - 1, actor) : null;
    return Response.json({ problem: value.problem, bundle: value.bundle, validation: value.validation, review: value.editorialReview, previous: previous?.problem ?? null }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return editorialError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request);
    const { id } = await params;
    const { decision, reason } = await readEditorialBody(request) as { decision: "approve" | "reject"; reason?: string };
    if (!new Set(["approve", "reject"]).has(decision)) throw new Error("Decisão inválida.");
    const value = await getEditorial().moderate(id, decision, actor, reason);
    return Response.json({ problem: value.problem, validation: value.validation });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 });
  }
}
