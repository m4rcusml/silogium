import { LocalAiAdapter } from "./local-ai.js";
import { GroqAuthoringAdapter } from "./groq.js";
import { GROQ_MODEL, type GroqTransportOptions } from "./groq-transport.js";
import type { AiAuthoringAdapter } from "./types.js";
import { localGroqCapacity } from "./groq-capacity.js";

export type AiProvider = "local" | "groq";
export type AiProviderConfiguration = { provider: AiProvider; model?: string };

/** Legacy credentials never select a provider or provide a paid fallback. */
export function resolveAiProviderConfiguration(environment: NodeJS.ProcessEnv = process.env): AiProviderConfiguration {
  const requested = environment.SILOGIUM_AI_PROVIDER?.trim().toLowerCase();
  if (requested && !["local", "groq"].includes(requested)) throw new Error("SILOGIUM_AI_PROVIDER inválido. Use groq ou local (simulador de testes).");
  const provider = (requested || (environment.GROQ_API_KEY?.trim() ? "groq" : "local")) as AiProvider;
  if (provider === "groq" && !environment.GROQ_API_KEY?.trim()) throw new Error("GROQ_API_KEY é obrigatória quando SILOGIUM_AI_PROVIDER=groq.");
  if (provider === "groq" && environment.GROQ_AUTHORING_MODEL?.trim() && environment.GROQ_AUTHORING_MODEL.trim() !== GROQ_MODEL)
    throw new Error(`O modelo habilitado é ${GROQ_MODEL}; não há fallback automático.`);
  return { provider, model: provider === "groq" ? GROQ_MODEL : undefined };
}

export function createAiAuthoringAdapterFromEnv(environment: NodeJS.ProcessEnv = process.env, options: Omit<GroqTransportOptions, "apiKey"> = {}): AiAuthoringAdapter {
  const configuration = resolveAiProviderConfiguration(environment);
  if (configuration.provider === "local") return new LocalAiAdapter();
  return new GroqAuthoringAdapter({ capacity: localGroqCapacity(), ...options, apiKey: environment.GROQ_API_KEY!.trim(), webSearch: environment.GROQ_WEB_SEARCH_ENABLED === "true" });
}
