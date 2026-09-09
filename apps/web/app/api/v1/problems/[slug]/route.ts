import { getOptionalActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";
import { loadVisibleBundle } from "@/lib/bundles";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getOptionalActor(request);
  const accessKey = new URL(request.url).searchParams.get("access_key") ?? undefined;
  const value = await getAuthoringRepository().getPackageBySlug(slug, actor, accessKey);
  if (!value) return Response.json({ error: "Questão não encontrada ou link sem autorização." }, { status: 404 });
  const bundle = value.bundle.visibleCases.length ? value.bundle : loadVisibleBundle(slug);
  return Response.json({ problem: value.problem, visibleCases: bundle.visibleCases });
}
