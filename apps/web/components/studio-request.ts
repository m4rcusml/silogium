import type { ProblemDefinition } from "@silogium/core";

export const problemStatusLabel: Record<ProblemDefinition["status"], string> = {
  draft: "Rascunho", validating: "Validando", validated: "Validada",
  pending_review: "Em revisão", published: "Publicada", rejected: "Rejeitada"
};

export const visibilityLabel: Record<ProblemDefinition["visibility"], string> = {
  private: "Privada", unlisted: "Não listada", public: "Pública"
};

export async function readStudioResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? `${fallback} (HTTP ${response.status}).`);
  if (!body) throw new Error("O servidor retornou uma resposta incompleta. Tente consultar novamente.");
  return body;
}

export function studioError(error: unknown, fallback = "Não foi possível conectar ao servidor. Tente novamente."): string {
  return error instanceof TypeError ? fallback : error instanceof Error ? error.message : fallback;
}

export function problemOrigin(problem: ProblemDefinition): string {
  const source = problem.provenance;
  return source.kind === "licensed_import"
    ? `Importada · ${source.sourceName} · ${source.licenseSpdx}`
    : `Silogium · @${source.createdByHandle ?? "autor"}${source.assistedByAi ? " + IA" : ""}`;
}
