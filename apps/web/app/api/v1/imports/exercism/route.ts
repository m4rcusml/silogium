import { RuntimeSchema } from "@silogium/core";
import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";
import { requireBetaAccess } from "@/lib/beta";
import { withExecutionActor } from "@/lib/operational-capacity";
import { requestFailure } from "@/lib/request-failure";
import { isHostedProduction } from "@/lib/production-config";

export async function POST(request: Request) {
  try {
    const actor = await getActor(request);
    await requireBetaAccess(actor);
    const body = await request.json() as { slug?: string; runtime?: unknown; conversationId?: string; async?: boolean };
    if (!body.slug || !/^[a-z0-9-]+$/.test(body.slug)) throw new Error("Slug do Exercism inválido.");
    const runtime = RuntimeSchema.parse(body.runtime);
    // Existing clients keep the synchronous response. Studio explicitly opts into recoverable jobs.
    if (body.async === true || isHostedProduction()) return Response.json(await getAuthoringModule().request({ mode: "import", sourceName: "Exercism", slug: body.slug, runtime, conversationId: body.conversationId }, actor), { status: 202 });
    const value = await withExecutionActor(actor, () => getAuthoringModule().importLicensed("Exercism", body.slug!, runtime, actor));
    return Response.json({ problem: value.problem, validation: value.validation }, { status: 201 });
  } catch (error) {
    return requestFailure(error, "Não foi possível importar o exercício.");
  }
}
