import type { BetaStatus } from "./beta";

export type StudioFeature = "search" | "create" | "refine" | "import";
export type FeatureAvailability = { available: boolean; reason?: string; retryAt?: string };
export type StudioAccess = { beta?: BetaStatus; features: Record<StudioFeature, FeatureAvailability> };

/** Display policy only. The server authorizes and reserves capacity again on every mutation. */
export function studioAccess(beta: BetaStatus | undefined, enabled: boolean, capacity: { groq: FeatureAvailability; modal: FeatureAvailability }): StudioAccess {
  const accessReason = !beta ? "Entre com GitHub para solicitar acesso ao beta." : beta.state === "pending" ? "Seu acesso ao beta aguarda aprovação." : beta.state === "rejected" ? "Seu pedido de acesso ao beta não foi aprovado." : beta.state === "revoked" ? "Seu acesso ao beta foi revogado." : undefined;
  const base = accessReason ? { available: false, reason: accessReason } : !enabled ? { available: false, reason: "A autoria ainda não está habilitada neste ambiente." } : { available: true };
  const compute = !base.available ? base : !capacity.groq.available ? capacity.groq : !capacity.modal.available ? capacity.modal : base;
  return { beta, features: {
    search: compute.available || !base.available ? base : { ...compute, reason: "A pesquisa assistida está pausada. Continue buscando no catálogo em Explorar." },
    create: compute,
    refine: compute,
    import: compute
  } };
}

export function creationQuotaReached(beta?: BetaStatus): boolean {
  return Boolean(beta && !beta.isAdmin && beta.remaining !== null && beta.remaining <= 0);
}

export function brasiliaResetLabel(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "à meia-noite, no horário de Brasília";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) + " (Brasília)";
}
