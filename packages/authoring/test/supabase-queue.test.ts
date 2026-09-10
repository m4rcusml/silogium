import { describe, expect, it, vi } from "vitest";
import { LocalAiAdapter, type AuthoringJob, type JobLease, type JobOutcome } from "../src/index.js";

const queuePath = "../../../apps/web/lib/supabase/authoring-queue.ts";
const { SupabaseAuthoringQueue } = await import(queuePath);
const actor = { id: "31000000-0000-4000-8000-000000000001", handle: "owner", role: "user" as const };
const request = { mode: "create", prompt: "trie compacto lexicográfico", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "unlisted" } as const;
const job: AuthoringJob = { id: "41000000-0000-4000-8000-000000000001", actorId: actor.id, status: "running", request, createdAt: "2026-09-10T00:00:00Z" };
const lease: JobLease = { job, actor, token: "51000000-0000-4000-8000-000000000001", attempt: 1, confirmed: false, checkpoints: {} };
function setup() {
  const rpc = vi.fn(async (_name: string, _payload: unknown) => ({ data: true as unknown, error: null as { message: string } | null }));
  return { rpc, queue: new SupabaseAuthoringQueue(() => ({ rpc })) };
}

describe("adapter RPC da fila", () => {
  it("separa resultado público de bundles privados e calcula hashes no servidor", async () => {
    const { rpc, queue } = setup();
    const generated = await new LocalAiAdapter().create(request, actor);
    generated.bundle.referenceSolutions.typescript = "PRIVATE_REFERENCE_SENTINEL";
    generated.bundle.hiddenCases[0]!.id = "PRIVATE_HIDDEN_SENTINEL";
    const value = { ...generated, validation: { valid: true, checks: [] }, accessKey: "owner-link-secret" };
    const outcome: JobOutcome = { job: { ...job, status: "completed", result: { kind: "create", package: value } }, effects: { package: value } };
    expect(await queue.finish(lease, outcome)).toBe(true);
    const payload = rpc.mock.calls[0]![1] as { p_action: string; p_payload: { jobId: string; token: string; outcome: { job: AuthoringJob; effects: { package: Record<string, unknown> } } } };
    expect(payload.p_action).toBe("finish"); expect(payload.p_payload.token).toBe(lease.token);
    expect(JSON.stringify(payload.p_payload.outcome.job)).not.toMatch(/PRIVATE_|referenceSolutions|hiddenCases/);
    const saved = payload.p_payload.outcome.effects.package;
    expect(saved.checksum).toMatch(/^[a-f0-9]{64}$/); expect(saved.accessHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.fingerprint).toBeTruthy(); expect(JSON.stringify(saved.bundle)).toContain("PRIVATE_REFERENCE_SENTINEL");
    expect(outcome.effects.package).not.toHaveProperty("checksum");
  });
  it.each(["heartbeat", "checkpoint", "reserveAi", "retry"] as const)("%s encaminha token e job fixos, nunca a identidade enviada pelo navegador", async (operation) => {
    const { rpc, queue } = setup();
    if (operation === "heartbeat") await queue.heartbeat(lease, 120);
    if (operation === "checkpoint") await queue.checkpoint(lease, "generated", { private: true });
    if (operation === "reserveAi") await queue.reserveAi(lease);
    if (operation === "retry") await queue.retry(lease, "safe error", false);
    expect(rpc).toHaveBeenCalledWith("authoring_queue", expect.objectContaining({ p_payload: expect.objectContaining({ jobId: job.id, token: lease.token }) }));
  });
  it("falha de migração não cai silenciosamente para memória", async () => {
    const { rpc, queue } = setup(); rpc.mockResolvedValue({ data: null, error: { message: "function not found" } });
    await expect(queue.claim("worker", 120)).rejects.toThrow("202609090010");
    await expect(new SupabaseAuthoringQueue(() => null).enqueue(job, actor)).rejects.toThrow("Supabase");
  });
  it("limpa candidatos externos e não aceita licença inventada nos efeitos", async () => {
    const { rpc, queue } = setup();
    await queue.finish(lease, { job: { ...job, status: "completed", result: { kind: "search", candidates: [] } }, effects: { candidates: [
      { id: "fake", kind: "licensed_import", title: "Fake", summary: "Não importável", url: "https://example.com/private", sourceName: "Exercism", licenseSpdx: "MIT", runtime: "typescript", importable: true }
    ] } });
    const payload = rpc.mock.calls[0]![1] as { p_payload: { outcome: JobOutcome } };
    expect(payload.p_payload.outcome.effects.candidates).toEqual([]);
  });
});
