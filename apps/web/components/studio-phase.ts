import type { AiPhase } from "@silogium/authoring";

const labels: Record<AiPhase, string> = {
  definition: "Definindo regras e assinaturas…", code: "Preparando starter e referência…",
  cases: "Construindo testes e exemplos…", search: "Pesquisando fontes externas…",
  validation: "Validando com o judge…", repair: "Corrigindo os pontos encontrados…",
  waiting: "Aguardando capacidade do Groq…"
};
export function studioPhase(phase: AiPhase | undefined) { return phase ? labels[phase] : undefined; }
