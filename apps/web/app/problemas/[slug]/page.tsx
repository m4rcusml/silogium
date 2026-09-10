import { notFound } from "next/navigation";
import { ProblemWorkspace } from "../../../components/problem-workspace";
import { getOptionalActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";
import { loadVisibleBundle } from "@/lib/bundles";

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ access_key?: string; version?: string; submission?: string; runtime?: string }> }) {
  const { slug } = await params;
  const { access_key: accessKey, version, submission, runtime } = await searchParams;
  const actor = await getOptionalActor();
  const repository = getAuthoringRepository();
  let value = await repository.getPackageBySlug(slug, actor, accessKey);
  if (!value) notFound();
  if (version !== undefined) {
    const selected = Number(version);
    if (!Number.isSafeInteger(selected) || selected < 1) notFound();
    value = await repository.getPackageVersion(value.problem.id, selected, actor, accessKey);
    if (!value) notFound();
  }
  const visibleCases = value.bundle.visibleCases.length ? value.bundle.visibleCases : loadVisibleBundle(slug).visibleCases;
  return <ProblemWorkspace key={`${actor?.id ?? "anonymous"}:${value.problem.id}:${value.problem.version}`} actorId={actor?.id ?? "anonymous"} problem={value.problem} visibleCases={visibleCases} accessKey={accessKey} reopenSubmission={submission?.slice(0, 100)} initialRuntime={runtime === "typescript" || runtime === "python" ? runtime : undefined} />;
}
