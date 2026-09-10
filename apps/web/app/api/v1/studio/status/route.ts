import { getOptionalActor } from "@/lib/actor";
import { getBetaStatus } from "@/lib/beta";
import { getOperationalAvailability } from "@/lib/operational-capacity";
import { studioAccess } from "@/lib/studio-access";
import { studioAvailability } from "@/lib/studio-availability";

export async function GET(request: Request) {
  try {
    const actor = await getOptionalActor(request);
    const [beta, capacity] = await Promise.all([actor ? getBetaStatus(actor) : undefined, getOperationalAvailability()]);
    return Response.json(studioAccess(beta, studioAvailability().available, capacity), { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível conferir seu acesso e a capacidade disponível. Atualize antes de enviar." }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
