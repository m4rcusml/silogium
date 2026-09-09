import { RuntimeSchema } from "@silogium/core";
import { getActor } from "@/lib/actor";
import { getAuthoringModule } from "@/lib/authoring";
import { consumeQuota } from "@/lib/usage";

export async function POST(request: Request) {
  try {
    const actor = await getActor(request);
    const body = await request.json() as { slug?: string; runtime?: unknown };
    if (!body.slug || !/^[a-z0-9-]+$/.test(body.slug)) throw new Error("Slug do Exercism inválido.");
    const runtime = RuntimeSchema.parse(body.runtime);
    const quota = await consumeQuota(actor.id, "ai");
    if (!quota.allowed) return Response.json({ error: "Sua cota diária de IA terminou. Tente novamente amanhã." }, { status: 429 });
    const value = await getAuthoringModule().importLicensed("Exercism", body.slug, runtime, actor);
    return Response.json({ problem: value.problem, validation: value.validation }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível importar o exercício." }, { status: 400 });
  }
}
