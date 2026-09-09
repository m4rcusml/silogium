import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const actor = await getActor(request);
    const { slug } = await params;
    const body = await request.json() as { licensesAccepted?: boolean };
    if (!body.licensesAccepted) throw new Error("Aceite as licenças CC BY 4.0 e MIT antes de solicitar publicação.");
    const value = await getAuthoringRepository().getPackageBySlug(slug, actor);
    if (!value) throw new Error("Questão não encontrada.");
    await getAuthoringRepository().requestPublication(value.problem.id, actor);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pedido inválido." }, { status: 400 });
  }
}
