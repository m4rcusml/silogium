import { CatalogExplorer } from "../../components/catalog-explorer";
import { getAuthoringRepository } from "@/lib/authoring";
import { getOptionalActor } from "@/lib/actor";

export const metadata = { title: "Praticar" };

export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [problems, { view }, actor] = await Promise.all([getAuthoringRepository().listCatalog(), searchParams, getOptionalActor()]);
  return <CatalogExplorer problems={problems} actorId={actor?.id ?? "anonymous"} initialView={view === "activity" ? "activity" : "catalog"} />;
}
