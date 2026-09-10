import { resolveAiProviderConfiguration } from "@silogium/authoring";
import { isHostedProduction } from "./production-config.js";

/** Only these display values reach the browser; worker credentials never do. */
export function studioAvailability(environment: NodeJS.ProcessEnv = process.env) {
  if (isHostedProduction(environment)) {
    const available = environment.SILOGIUM_AUTHORING_ENABLED === "true";
    return { available, providerLabel: available ? "Processamento em segundo plano" : "IA ainda não habilitada neste ambiente" };
  }
  const ai = resolveAiProviderConfiguration(environment);
  return { available: true, providerLabel: ai.provider === "codex" ? `Codex local · ${ai.model}`
    : ai.provider === "openai" ? `OpenAI · ${ai.model}` : "Simulador local" };
}
