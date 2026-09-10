import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    return Response.json({ reviews: (await getAuthoringRepository().listPending(actor)).map((item) => ({ problem: item.problem, validation: item.validation, review: item.editorialReview })) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 403 });
  }
}
