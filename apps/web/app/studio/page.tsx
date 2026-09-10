import { AssistantWorkbench } from "@/components/assistant-workbench";
import { getOptionalActor } from "@/lib/actor";
import { studioAvailability } from "@/lib/studio-availability";
import { getBetaStatus } from "@/lib/beta";
import { getOperationalAvailability } from "@/lib/operational-capacity";
import { studioAccess, type StudioAccess } from "@/lib/studio-access";
import "./conversations.css";
import "./orientation.css";
import "./library.css";

export const metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ section?: string; mode?: string; slug?: string }> }) {
  const [{ section, mode, slug }, actor] = await Promise.all([searchParams, getOptionalActor()]);
  const { providerLabel, available } = studioAvailability();
  let initialAccess: StudioAccess | undefined;
  try {
    const [beta, capacity] = await Promise.all([actor ? getBetaStatus(actor) : undefined, getOperationalAvailability()]);
    initialAccess = studioAccess(beta, available, capacity);
  } catch { /* Render the workspace safely; an explicit refresh can recover without hiding saved work. */ }
  return <AssistantWorkbench providerLabel={providerLabel} authoringAvailable={available} initialAccess={initialAccess} initialSection={section === "mine" ? "mine" : "compose"} initialMode={mode === "refine" && slug ? "refine" : mode === "create" ? "create" : "search"} initialSlug={slug} isAdmin={actor?.role === "admin"} actorId={actor?.id} />;
}
