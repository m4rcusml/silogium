import { getActor } from "@/lib/actor";
import { getBetaStatus } from "@/lib/beta";

export async function GET(request: Request) {
  try {
    return Response.json(await getBetaStatus(await getActor(request)), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar seu acesso." }, { status: 403, headers: { "cache-control": "private, no-store" } });
  }
}
