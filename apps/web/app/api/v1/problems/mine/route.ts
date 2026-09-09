import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    return Response.json({ problems: (await getAuthoringRepository().listForActor(actor)).map((item) => item.problem) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
