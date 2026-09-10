import { resolveAiProviderConfiguration } from "@silogium/authoring";
import { AssistantWorkbench } from "@/components/assistant-workbench";
import { getOptionalActor } from "@/lib/actor";
import "./conversations.css";
import "./orientation.css";
import "./library.css";

export const metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ section?: string; mode?: string; slug?: string }> }) {
  const [{ section, mode, slug }, actor] = await Promise.all([searchParams, getOptionalActor()]);
  const ai = resolveAiProviderConfiguration(process.env);
  const providerLabel = ai.provider === "codex"
    ? `Codex local · ${ai.model}`
    : ai.provider === "openai"
      ? `OpenAI · ${ai.model}`
      : "Simulador local";
  return <AssistantWorkbench providerLabel={providerLabel} initialSection={section === "mine" ? "mine" : "compose"} initialMode={mode === "refine" && slug ? "refine" : mode === "create" ? "create" : "search"} initialSlug={slug} isAdmin={actor?.role === "admin"} actorId={actor?.id} />;
}
