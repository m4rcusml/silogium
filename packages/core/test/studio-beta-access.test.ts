import { describe, expect, it } from "vitest";
import { brasiliaResetLabel, creationQuotaReached, studioAccess } from "../../../apps/web/lib/studio-access.js";
import type { BetaStatus } from "../../../apps/web/lib/beta.js";

const beta: BetaStatus = { state: "approved", isAdmin: false, dailyLimit: 2, remaining: 2, createdToday: 0, reservedToday: 0, resetsAt: "2026-09-11T03:00:00Z" };
const online = { groq: { available: true }, modal: { available: true } };

describe("a interface separa acesso, cota pessoal e capacidade por serviço", () => {
  it.each(["pending", "rejected", "revoked"] as const)("não libera recursos a participante %s", state => {
    const view = studioAccess({ ...beta, state }, true, online);
    expect(Object.values(view.features).every(feature => !feature.available)).toBe(true);
    expect(view.beta?.remaining).toBe(2);
  });
  it("visitante vê instrução de login; aprovação não é presumida", () => {
    expect(studioAccess(undefined, true, online).features.search).toEqual({ available: false, reason: "Entre com GitHub para solicitar acesso ao beta." });
  });
  it("cota diária esgotada não desliga pesquisa, refinamento ou recursos globais", () => {
    const exhausted = { ...beta, remaining: 0, createdToday: 2 };
    const view = studioAccess(exhausted, true, online);
    expect(creationQuotaReached(exhausted)).toBe(true);
    expect(view.features.search.available).toBe(true);
    expect(view.features.refine.available).toBe(true);
    expect(view.features.create.available).toBe(true); // The quota is shown as a separate constraint.
  });
  it.each(["groq", "modal"] as const)("capacidade de %s pausa a pesquisa assistida, com caminho ao catálogo", service => {
    const paused = { available: false, reason: "Capacidade temporariamente pausada", retryAt: "2026-09-11T03:00:00Z" };
    const view = studioAccess(beta, true, { ...online, [service]: paused });
    expect(view.features.search.available).toBe(false);
    expect(view.features.search.reason).toContain("catálogo em Explorar");
    expect(view.features.create).toEqual(paused);
    expect(view.features.refine).toEqual(paused);
    expect(view.features.import).toEqual(paused);
  });
  it("administrador é isento só da cota, não da capacidade nem da feature flag", () => {
    const admin = { ...beta, isAdmin: true, dailyLimit: null, remaining: null };
    expect(creationQuotaReached(admin)).toBe(false);
    expect(studioAccess(admin, true, { ...online, modal: { available: false } }).features.create.available).toBe(false);
    expect(studioAccess(admin, false, online).features.search.available).toBe(false);
  });
  it("reset é exibido no horário de Brasília, independente do navegador", () => {
    expect(brasiliaResetLabel(beta.resetsAt)).toMatch(/11\/09.*00:00.*Brasília/);
    expect(brasiliaResetLabel("invalid")).toContain("meia-noite");
  });
});
