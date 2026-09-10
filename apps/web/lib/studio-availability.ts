import { resolveAiProviderConfiguration } from "@silogium/authoring";
import { isHostedProduction } from "./production-config.js";

/** Only these display values reach the browser; worker credentials never do. */
export function studioAvailability(environment: NodeJS.ProcessEnv = process.env) {
  if (isHostedProduction(environment)) {
    const available = environment.SILOGIUM_AUTHORING_ENABLED === "true";
    return { available, providerLabel: available ? "Processamento em segundo plano" : "IA ainda não habilitada neste ambiente" };
  }
  try {
    const ai = resolveAiProviderConfiguration(environment);
    return { available: true, providerLabel: ai.provider === "groq" ? `Groq · ${ai.model}` : "Simulador local" };
  } catch { return { available: false, providerLabel: "IA indisponível · confira a configuração do Groq" }; }
}
