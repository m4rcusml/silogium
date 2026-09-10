import { CodexAuthoringAdapter } from "./codex.js";
import { LocalAiAdapter } from "./local-ai.js";
import { OpenAiAuthoringAdapter } from "./openai.js";
import type { AiAuthoringAdapter } from "./types.js";

export type AiProvider = "local" | "codex" | "openai";

export type AiProviderConfiguration = {
  provider: AiProvider;
  model?: string;
};

function positiveNumber(value: string | undefined, fallback: number, variable: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${variable} deve ser um número positivo.`);
  return parsed;
}

export function resolveAiProviderConfiguration(environment: NodeJS.ProcessEnv = process.env): AiProviderConfiguration {
  const requested = environment.SILOGIUM_AI_PROVIDER?.trim().toLowerCase();
  if (requested && !new Set(["local", "codex", "openai"]).has(requested)) {
    throw new Error(`SILOGIUM_AI_PROVIDER inválido: ${requested}. Use local, codex ou openai.`);
  }
  const provider = (requested || (environment.OPENAI_API_KEY ? "openai" : "local")) as AiProvider;
  if (provider === "openai" && !environment.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY é obrigatória quando SILOGIUM_AI_PROVIDER=openai.");
  }
  return {
    provider,
    model: provider === "codex"
      ? environment.CODEX_AUTHORING_MODEL?.trim() || "gpt-5.6-terra"
      : provider === "openai"
        ? environment.OPENAI_AUTHORING_MODEL?.trim() || "gpt-5.6-terra"
        : undefined
  };
}

export function createAiAuthoringAdapterFromEnv(environment: NodeJS.ProcessEnv = process.env): AiAuthoringAdapter {
  const configuration = resolveAiProviderConfiguration(environment);
  if (configuration.provider === "local") return new LocalAiAdapter();
  if (configuration.provider === "codex") {
    return new CodexAuthoringAdapter(
      environment.CODEX_AUTHORING_MODEL?.trim() || "gpt-5.6-terra",
      environment.CODEX_DISCOVERY_MODEL?.trim() || "gpt-5.6-luna",
      {
        timeoutMs: positiveNumber(environment.CODEX_TIMEOUT_MS, 600_000, "CODEX_TIMEOUT_MS"),
        workingDirectory: environment.CODEX_WORKING_DIRECTORY?.trim() || process.cwd()
      }
    );
  }
  return new OpenAiAuthoringAdapter(
    environment.OPENAI_API_KEY!,
    environment.OPENAI_DISCOVERY_MODEL,
    environment.OPENAI_AUTHORING_MODEL
  );
}
