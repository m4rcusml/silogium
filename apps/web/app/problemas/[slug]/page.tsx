import { notFound } from "next/navigation";
import { ProblemWorkspace } from "../../../components/problem-workspace";
import { getOptionalActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ access_key?: string }> }) {
  const { slug } = await params;
  const { access_key: accessKey } = await searchParams;
  const value = await getAuthoringRepository().getPackageBySlug(slug, await getOptionalActor(), accessKey);
  if (!value) notFound();
  return <ProblemWorkspace problem={value.problem} accessKey={accessKey} />;
}
