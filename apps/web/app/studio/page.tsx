import { AssistantWorkbench } from "@/components/assistant-workbench";
import { getOptionalActor } from "@/lib/actor";
import { studioAvailability } from "@/lib/studio-availability";
import "./conversations.css";
import "./orientation.css";
import "./library.css";

export const metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ section?: string; mode?: string; slug?: string }> }) {
  const [{ section, mode, slug }, actor] = await Promise.all([searchParams, getOptionalActor()]);
  const { providerLabel, available } = studioAvailability();
  return <AssistantWorkbench providerLabel={providerLabel} authoringAvailable={available} initialSection={section === "mine" ? "mine" : "compose"} initialMode={mode === "refine" && slug ? "refine" : mode === "create" ? "create" : "search"} initialSlug={slug} isAdmin={actor?.role === "admin"} actorId={actor?.id} />;
}
