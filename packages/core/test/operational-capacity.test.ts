import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CapacityUnavailableError, seedProblems } from "../src/index.js";
const state = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn(), evaluate: vi.fn(), client: true }));
vi.mock("../../../apps/web/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => state.client ? { rpc: state.rpc } : null }));
vi.mock("../../../apps/web/lib/beta", () => ({ requireBetaAccess: state.access }));
vi.mock("@silogium/judge", () => ({ createJudgeFromEnv: () => ({ evaluate: state.evaluate }) }));
import { finishModalReservation, getOperationalAvailability, requireOperationalCapacity, reserveModalCapacity, setOperationalPaused, withExecutionActor } from "../../../apps/web/lib/operational-capacity.js";
import { getPlatformJudge, modalReservationMicrousd } from "../../../apps/web/lib/platform-judge.js";
const available = { groq: { available: true }, modal: { available: true } };
const actor = { id: "test-user", handle: "tester", role: "user" as const };
beforeEach(() => { state.client = true; state.rpc.mockReset().mockResolvedValue({ data: available, error: null }); state.access.mockReset().mockResolvedValue({ state: "approved" }); state.evaluate.mockReset().mockResolvedValue({ verdict: "accepted" }); });
afterEach(() => vi.unstubAllEnvs());

describe("capacidade operacional compartilhada", () => {
  it("retorna disponibilidade independente por fornecedor", async () => {
    state.rpc.mockResolvedValue({ data: { ...available, groq: { available: false, reason: "IA pausada" } }, error: null });
    expect(await getOperationalAvailability()).toEqual({ ...available, groq: { available: false, reason: "IA pausada" } });
    await requireOperationalCapacity("modal");
    await expect(requireOperationalCapacity("groq")).rejects.toThrow(CapacityUnavailableError);
  });
  it("falha fechada quando banco, migração ou resposta ficam indisponíveis", async () => {
    for (const response of [{ data: null, error: { message: "secret-provider-message" } }, { data: { groq: { available: "yes" } }, error: null }]) {
      state.rpc.mockResolvedValue(response);
      const result = await getOperationalAvailability();
      expect(result.groq.available).toBe(false); expect(result.modal.available).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secret-provider-message");
    }
  });
  it("verifica o lease e revogação antes de cada uso inclusive por administradores", async () => {
    const fence = vi.fn().mockResolvedValue(undefined);
    await withExecutionActor({ ...actor, role: "admin" }, () => requireOperationalCapacity("groq"), fence);
    expect(fence).toHaveBeenCalledOnce(); expect(state.access).toHaveBeenCalledWith({ ...actor, role: "admin" });
    state.access.mockRejectedValue(new Error("revogado")); state.rpc.mockClear();
    await expect(withExecutionActor(actor, () => reserveModalCapacity(crypto.randomUUID(), 2000))).rejects.toThrow("revogado");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("nega uma reserva compartilhada insuficiente", async () => {
    state.rpc.mockResolvedValueOnce({ data: available, error: null }).mockResolvedValueOnce({ data: { allowed: false, availability: { available: false, reason: "Saldo insuficiente" } }, error: null });
    await expect(reserveModalCapacity("reservation", 4000)).rejects.toThrow("Saldo insuficiente");
    expect(state.rpc).toHaveBeenLastCalledWith("operational_capacity", { p_action: "reserve_modal", p_payload: { id: "reservation", estimateMicrousd: 4000 } });
  });
  it("finaliza sem inventar consumo real nem devolver valor desconhecido", async () => {
    await finishModalReservation("reservation");
    expect(state.rpc).toHaveBeenCalledWith("operational_capacity", { p_action: "finish_modal", p_payload: { id: "reservation" } });
  });
  it("só administrador pode alterar a suspensão e não altera financeiro", async () => {
    await expect(setOperationalPaused(actor, "modal", false)).rejects.toThrow("administradores");
    expect(state.rpc).not.toHaveBeenCalled();
    await setOperationalPaused({ ...actor, role: "admin" }, "groq", true);
    expect(state.rpc).toHaveBeenLastCalledWith("operational_capacity", { p_action: "set_paused", p_payload: { actorId: actor.id, service: "groq", paused: true } });
  });
  it("renovação desconhecida não fabrica horário; backoff interno continua limitado", () => {
    const error = new CapacityUnavailableError("modal", { available: false });
    expect(error.retryAt).toBeUndefined(); expect(error.retryAfterMs()).toBe(300000);
    expect(new CapacityUnavailableError("groq", { available: false, retryAt: "2026-09-10T15:00:00Z" }).retryAfterMs(Date.parse("2026-09-10T14:59:00Z"))).toBe(60000);
  });
  it("reserva pelo número de sandboxes e RAM, não apenas pelo tempo do candidato", () => {
    const problem = seedProblems[0]!;
    const bundle = { problemId: problem.id, problemVersion: problem.version, visibleCases: [{ id: "a", stage: 1 }], hiddenCases: [{ id: "b", stage: 2 }], referenceSolutions: {} } as Parameters<typeof modalReservationMicrousd>[1];
    const request = { problemId: problem.id, problemVersion: 1, runtime: "typescript", kind: "run", source: "" } as const;
    const run = modalReservationMicrousd(problem, bundle, request);
    const submission = modalReservationMicrousd(problem, bundle, { ...request, kind: "submission" });
    expect(run).toBeGreaterThan(3000); expect(submission).toBeGreaterThan(run);
    expect(modalReservationMicrousd(problem, bundle, { ...request, kind: "submission", maxStage: 1 })).toBe(run);
  });
  it("wrapper não chama Modal sem ledger, mesmo em desenvolvimento", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("MODAL_JUDGE_ENDPOINT", "https://test--judge.modal.run");
    state.client = false;
    const problem = seedProblems[0]!;
    const bundle = { schemaVersion: 1 as const, problemId: problem.id, problemVersion: 1, visibleCases: [], hiddenCases: [], referenceSolutions: {} };
    await expect(getPlatformJudge().evaluate(problem, bundle, { problemId: problem.id, problemVersion: 1, runtime: "typescript", kind: "run", source: "" })).rejects.toThrow("inclusive em desenvolvimento");
    expect(state.evaluate).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("wrapper só envia código depois da reserva e nunca finge devolução", async () => {
    vi.stubEnv("MODAL_JUDGE_ENDPOINT", "https://test--judge.modal.run");
    const problem = seedProblems[0]!;
    const bundle = { schemaVersion: 1 as const, problemId: problem.id, problemVersion: 1, visibleCases: [], hiddenCases: [], referenceSolutions: {} };
    const request = { problemId: problem.id, problemVersion: 1, runtime: "typescript", kind: "run", source: "" } as const;
    state.rpc.mockResolvedValueOnce({ data: available, error: null }).mockResolvedValueOnce({ data: { allowed: false, availability: { available: false, reason: "Saldo insuficiente" } }, error: null });
    await expect(getPlatformJudge().evaluate(problem, bundle, request)).rejects.toThrow(CapacityUnavailableError);
    expect(state.evaluate).not.toHaveBeenCalled();
    state.rpc.mockReset().mockResolvedValueOnce({ data: available, error: null }).mockResolvedValueOnce({ data: { allowed: true }, error: null }).mockResolvedValueOnce({ data: true, error: null });
    expect(await getPlatformJudge().evaluate(problem, bundle, request)).toEqual({ verdict: "accepted" });
    expect(state.evaluate).toHaveBeenCalledOnce();
    expect(state.rpc.mock.calls.map(call => call[1].p_action)).toEqual(["status", "reserve_modal", "finish_modal"]);
  });
});
