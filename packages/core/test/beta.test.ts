import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ rpc: vi.fn(), wake: vi.fn(), configured: true }));
vi.mock("../../../apps/web/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => deps.configured ? { rpc: deps.rpc } : null }));
vi.mock("../../../apps/web/lib/worker-wakeup", () => ({ wakeAuthoringWorker: deps.wake }));
const betaPath = "../../../apps/web/lib/beta";
const { BetaAccessError, cancelBetaJob, getBetaStatus, listBetaParticipants, requireBetaAccess, resumeBetaJob, updateBetaParticipant } = await import(betaPath);
const user = { id: "14000000-0000-4000-8000-000000000001", handle: "member", role: "user" as const };
const admin = { ...user, id: "14000000-0000-4000-8000-000000000002", role: "admin" as const };
const status = { state: "approved", isAdmin: false, dailyLimit: 2, createdToday: 1, reservedToday: 1, remaining: 0, resetsAt: "2026-09-11T03:00:00Z" };
beforeEach(() => { deps.configured = true; deps.rpc.mockReset(); deps.wake.mockReset(); deps.wake.mockResolvedValue("notified"); deps.rpc.mockResolvedValue({ data: status, error: null }); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("beta access module", () => {
  it("returns authoritative status even if the Actor claims admin", async () => {
    expect(await getBetaStatus(admin)).toEqual(status);
    expect(deps.rpc).toHaveBeenCalledWith("beta_access", { p_action: "status", p_actor_id: admin.id, p_payload: {} });
  });
  it.each(["pending", "rejected", "revoked"])("blocks %s with a safe typed error", async (state) => {
    deps.rpc.mockResolvedValue({ data: { ...status, state }, error: null });
    await expect(requireBetaAccess(user)).rejects.toMatchObject({ statusCode: 403, code: "beta_access_required", betaStatus: { state } });
    await expect(requireBetaAccess(user)).rejects.toBeInstanceOf(BetaAccessError);
  });
  it("remaining zero is not an access denial for searches or existing problems", async () => {
    await expect(requireBetaAccess(user)).resolves.toMatchObject({ remaining: 0, state: "approved" });
  });
  it("fails closed on unavailable SQL without exposing infrastructure error", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE_DATABASE_VALUE" } });
    await expect(requireBetaAccess(user)).rejects.toThrow("Não foi possível");
    await expect(requireBetaAccess(user)).rejects.not.toThrow("PRIVATE_DATABASE_VALUE");
  });
  it("rechecks administrator in the database before resolving an invite", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    await expect(updateBetaParticipant(admin, { action: "invite", githubHandle: "someone" })).rejects.toThrow("Apenas administradores");
    expect(network).not.toHaveBeenCalled();
  });
  it("binds a GitHub invitation to verified numeric ID, not the typed handle", async () => {
    deps.rpc.mockResolvedValueOnce({ data: { ...status, isAdmin: true }, error: null }).mockResolvedValueOnce({ data: true, error: null });
    const network = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 12345, login: "CanonicalName", type: "User" }) });
    vi.stubGlobal("fetch", network);
    await updateBetaParticipant(admin, { action: "invite", githubHandle: "@canonicalname" });
    expect(network).toHaveBeenCalledWith("https://api.github.com/users/canonicalname", expect.objectContaining({ redirect: "error", cache: "no-store" }));
    expect(deps.rpc).toHaveBeenLastCalledWith("beta_access", { p_action: "invite", p_actor_id: admin.id, p_payload: { githubId: "12345", githubHandle: "CanonicalName" } });
  });
  it.each([{ id: "123", login: "name", type: "User" }, { id: 1, login: "team", type: "Organization" }])("rejects unverified identity shape %o", async (profile) => {
    deps.rpc.mockResolvedValue({ data: { ...status, isAdmin: true }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => profile }));
    await expect(updateBetaParticipant(admin, { action: "invite", githubHandle: "name" })).rejects.toThrow("conta pessoal");
    expect(deps.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects arbitrary URLs instead of requesting them", async () => {
    deps.rpc.mockResolvedValue({ data: { ...status, isAdmin: true }, error: null });
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    await expect(updateBetaParticipant(admin, { action: "invite", githubHandle: "https://example.com/" })).rejects.toThrow("usuário GitHub");
    expect(network).not.toHaveBeenCalled();
  });
  it("revokes only the immutable preinvitation through an admin-checked mutation", async () => {
    deps.rpc.mockResolvedValueOnce({ data: { ...status, isAdmin: true }, error: null }).mockResolvedValueOnce({ data: true, error: null });
    await updateBetaParticipant(admin, { action: "revoke_invite", githubId: "12345" });
    expect(deps.rpc).toHaveBeenLastCalledWith("beta_access", { p_action: "revoke_invite", p_actor_id: admin.id, p_payload: { githubId: "12345" } });
  });
  it("lists participants via a separate admin-checked RPC", async () => {
    deps.rpc.mockResolvedValue({ data: { participants: [], invitations: [] }, error: null });
    expect(await listBetaParticipants(admin)).toEqual({ participants: [], invitations: [] });
    expect(deps.rpc).toHaveBeenCalledWith("beta_access", { p_action: "list", p_actor_id: admin.id, p_payload: {} });
  });
  it("allows cancellation without requiring active access; resume rechecks access", async () => {
    deps.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await cancelBetaJob(user, "job")).toBe(true);
    expect(deps.rpc).toHaveBeenCalledWith("beta_access", { p_action: "cancel_job", p_actor_id: user.id, p_payload: { jobId: "job" } });
    deps.rpc.mockResolvedValueOnce({ data: { ...status, state: "revoked" }, error: null });
    await expect(resumeBetaJob(user, "job")).rejects.toBeInstanceOf(BetaAccessError);
    expect(deps.rpc).toHaveBeenCalledTimes(2);
    expect(deps.wake).not.toHaveBeenCalled();
  });
  it("wakes resumed work only after a successful commit, best effort", async () => {
    deps.rpc.mockResolvedValueOnce({ data: status, error: null }).mockResolvedValueOnce({ data: true, error: null });
    deps.wake.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(resumeBetaJob(user, "job")).resolves.toBe(true);
    expect(deps.wake).toHaveBeenCalledTimes(1);
    expect(deps.wake.mock.invocationCallOrder[0]).toBeGreaterThan(deps.rpc.mock.invocationCallOrder[1]!);
  });
  it("approval wakes recovered access-paused jobs after its transaction", async () => {
    deps.rpc.mockResolvedValueOnce({ data: { ...status, isAdmin: true }, error: null }).mockResolvedValueOnce({ data: true, error: null });
    await updateBetaParticipant(admin, { action: "approve", userId: user.id });
    expect(deps.wake).toHaveBeenCalledTimes(1);
    expect(deps.wake.mock.invocationCallOrder[0]).toBeGreaterThan(deps.rpc.mock.invocationCallOrder[1]!);
  });
  it("does not wake work after a rejected resume", async () => {
    deps.rpc.mockResolvedValueOnce({ data: status, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await resumeBetaJob(user, "job")).toBe(false);
    expect(deps.wake).not.toHaveBeenCalled();
  });
  it("local admin stays exempt and local unapproved users do not become approved", async () => {
    deps.configured = false; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T02:59:59Z"));
    expect(await getBetaStatus(admin)).toMatchObject({ state: "approved", dailyLimit: null, remaining: null, resetsAt: "2026-09-10T03:00:00.000Z" });
    expect(await getBetaStatus(user)).toMatchObject({ state: "pending", dailyLimit: 2 });
  });
});
