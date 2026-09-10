import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "trusted-actor", handle: "trusted", role: "admin" as "admin" | "user" },
  getActor: vi.fn(), optionalActor: vi.fn(), studioAvailability: vi.fn(),
  getBetaStatus: vi.fn(), listBetaParticipants: vi.fn(), updateBetaParticipant: vi.fn(),
  cancelBetaJob: vi.fn(), resumeBetaJob: vi.fn(), getOperationalAvailability: vi.fn(), setOperationalPaused: vi.fn()
}));
vi.mock("@/lib/actor", () => ({ getActor: mocks.getActor, getOptionalActor: mocks.optionalActor }));
vi.mock("@/lib/beta", () => mocks);
vi.mock("@/lib/operational-capacity", () => mocks);
vi.mock("@/lib/studio-availability", () => ({ studioAvailability: mocks.studioAvailability }));
const accessPath = "../../../apps/web/app/api/v1/admin/beta/route";
const statusPath = "../../../apps/web/app/api/v1/beta/route";
const capacityPath = "../../../apps/web/app/api/v1/admin/capacity/route";
const cancelPath = "../../../apps/web/app/api/v1/jobs/[id]/cancel/route";
const resumePath = "../../../apps/web/app/api/v1/jobs/[id]/resume/route";
const studioPath = "../../../apps/web/app/api/v1/studio/status/route";
const access = await import(accessPath);
const status = await import(statusPath);
const capacity = await import(capacityPath);
const cancel = await import(cancelPath);
const resume = await import(resumePath);
const studio = await import(studioPath);
const origin = "https://silogium.test";
const context = { params: Promise.resolve({ id: "test-job" }) };
function request(body?: unknown, source = origin, authorization?: string) {
  return new Request(`${origin}/api/test`, { method: "POST", headers: { origin: source, "content-type": "application/json", ...(authorization ? { authorization } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.role = "admin";
  mocks.getActor.mockResolvedValue(mocks.actor);
  mocks.optionalActor.mockResolvedValue(mocks.actor); mocks.studioAvailability.mockReturnValue({ available: true });
  mocks.getBetaStatus.mockResolvedValue({ state: "approved", remaining: null });
  mocks.listBetaParticipants.mockResolvedValue({ participants: [], invitations: [] });
  mocks.getOperationalAvailability.mockResolvedValue({ groq: { available: true }, modal: { available: false, reason: "Sem crédito confirmado" } });
  mocks.setOperationalPaused.mockResolvedValue({ groq: { available: false }, modal: { available: false } });
  mocks.cancelBetaJob.mockResolvedValue(true); mocks.resumeBetaJob.mockResolvedValue(true);
});

describe("consulta de disponibilidade do Studio", () => {
  it("retorna acesso e disponibilidade separados, privados e sem configuração interna", async () => {
    const response = await studio.GET(request());
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.beta).toEqual({ state: "approved", remaining: null });
    expect(body.features.create).toEqual({ available: false, reason: "Sem crédito confirmado" });
    expect(Object.keys(body).sort()).toEqual(["beta", "features"]);
  });
  it("visitante não consulta saldo de outro usuário", async () => {
    mocks.optionalActor.mockResolvedValue(undefined);
    const body = await (await studio.GET(request())).json();
    expect(body.beta).toBeUndefined();
    expect(body.features.create.available).toBe(false);
    expect(mocks.getBetaStatus).not.toHaveBeenCalled();
  });
  it("indisponibilidade de conta falha fechada sem expor erro interno", async () => {
    mocks.getBetaStatus.mockRejectedValue(new Error("PRIVATE_BACKEND_DETAIL"));
    const response = await studio.GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_BACKEND_DETAIL");
  });
});

describe("rotas de administração do beta", () => {
  it.each(["admin", "user"] as const)("recusa token CLI de %s antes de resolver ator em todas as rotas de operação web", async role => {
    mocks.actor.role = role;
    const auth = "Bearer cli-scope-token";
    const results = await Promise.all([
      access.GET(request(undefined, origin, auth)),
      access.PATCH(request({ action: "approve", userId: "person" }, origin, auth)),
      capacity.GET(request(undefined, origin, auth)),
      capacity.PATCH(request({ service: "groq", paused: true }, origin, auth)),
      cancel.POST(request(undefined, origin, auth), context),
      resume.POST(request(undefined, origin, auth), context)
    ]);
    expect(results.map(response => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(mocks.getActor).not.toHaveBeenCalled();
    expect(mocks.updateBetaParticipant).not.toHaveBeenCalled();
    expect(mocks.setOperationalPaused).not.toHaveBeenCalled();
    expect(mocks.cancelBetaJob).not.toHaveBeenCalled();
    expect(mocks.resumeBetaJob).not.toHaveBeenCalled();
  });
  it("status pessoal usa somente ator autenticado e nunca cache público", async () => {
    const response = await status.GET(request());
    expect(mocks.getBetaStatus).toHaveBeenCalledExactlyOnceWith(mocks.actor);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("lista administrativa é privada e não aceita usuário comum", async () => {
    const response = await access.GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    mocks.actor.role = "user";
    expect((await access.GET(request())).status).toBe(403);
    expect(mocks.listBetaParticipants).toHaveBeenCalledTimes(1);
  });
  it("permissão e CSRF são conferidos antes de alterar participantes", async () => {
    const body = { action: "approve", userId: "person", actor: { role: "admin" } };
    mocks.actor.role = "user";
    expect((await access.PATCH(request(body))).status).toBe(403);
    mocks.actor.role = "admin";
    expect((await access.PATCH(request(body, "https://evil.test"))).status).toBe(403);
    expect(mocks.updateBetaParticipant).not.toHaveBeenCalled();
  });
  it.each(["approve", "reject", "revoke"])("%s mantém identidade do servidor e seleciona só campos permitidos", async action => {
    expect((await access.PATCH(request({ action, userId: "person", actor: { id: "fake" }, role: "admin" }))).status).toBe(200);
    expect(mocks.updateBetaParticipant).toHaveBeenCalledExactlyOnceWith(mocks.actor, { action, userId: "person" });
  });
  it("convite usa somente handle; identidade GitHub é verificada no módulo", async () => {
    await access.PATCH(request({ action: "invite", githubHandle: " @example ", githubId: "forged" }));
    expect(mocks.updateBetaParticipant).toHaveBeenCalledExactlyOnceWith(mocks.actor, { action: "invite", githubHandle: "example" });
  });
  it("revoga a pré-aprovação pelo ID imutável, sem trocar por nome editável", async () => {
    expect((await access.PATCH(request({ action: "revoke_invite", githubId: "123456", githubHandle: "forged" }))).status).toBe(200);
    expect(mocks.updateBetaParticipant).toHaveBeenCalledExactlyOnceWith(mocks.actor, { action: "revoke_invite", githubId: "123456" });
    expect((await access.PATCH(request({ action: "revoke_invite", githubId: "../other" }))).status).toBe(400);
    expect(mocks.updateBetaParticipant).toHaveBeenCalledTimes(1);
  });
  it.each([{ action: "delete", userId: "person" }, { action: "approve" }, [], null, { action: "invite", githubHandle: "a".repeat(3_000) }])("recusa payload inválido %j", async body => {
    expect((await access.PATCH(request(body))).status).toBe(400);
    expect(mocks.updateBetaParticipant).not.toHaveBeenCalled();
  });
  it("controle de capacidade não expõe atestação financeira nem coerciona booleanos", async () => {
    expect((await capacity.PATCH(request({ service: "modal", paused: "false", action: "verify_modal" }))).status).toBe(400);
    expect(mocks.setOperationalPaused).not.toHaveBeenCalled();
    await capacity.PATCH(request({ service: "groq", paused: true, action: "verify_modal" }));
    expect(mocks.setOperationalPaused).toHaveBeenCalledExactlyOnceWith(mocks.actor, "groq", true);
  });
  it("capacidade requer administrador e mesma origem", async () => {
    mocks.actor.role = "user";
    expect((await capacity.GET(request())).status).toBe(403);
    expect((await capacity.PATCH(request({ service: "groq", paused: true }))).status).toBe(403);
    mocks.actor.role = "admin";
    expect((await capacity.PATCH(request({ service: "groq", paused: true }, "https://evil.test"))).status).toBe(403);
    expect(mocks.setOperationalPaused).not.toHaveBeenCalled();
  });
});

describe("controle de pedidos não duplica criação", () => {
  it("cancelar e retomar encaminham ID e ator confiáveis ao módulo com ownership", async () => {
    mocks.actor.role = "user";
    expect((await cancel.POST(request(), context)).status).toBe(200);
    expect(mocks.cancelBetaJob).toHaveBeenCalledExactlyOnceWith(mocks.actor, "test-job");
    expect((await resume.POST(request(), context)).status).toBe(200);
    expect(mocks.resumeBetaJob).toHaveBeenCalledExactlyOnceWith(mocks.actor, "test-job");
  });
  it("não comunica sucesso quando a transição não foi aplicada", async () => {
    mocks.cancelBetaJob.mockResolvedValue(false);
    expect((await cancel.POST(request(), context)).status).toBe(409);
  });
  it("bloqueia cross-origin e IDs inválidos antes da mutação", async () => {
    expect((await cancel.POST(request(undefined, "https://evil.test"), context)).status).toBe(403);
    expect((await resume.POST(request(), { params: Promise.resolve({ id: "../other" }) })).status).toBe(400);
    expect(mocks.cancelBetaJob).not.toHaveBeenCalled(); expect(mocks.resumeBetaJob).not.toHaveBeenCalled();
  });
});
