import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedProblems, type Actor, type SolutionSnapshot } from "../src/index.js";

vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => null }));
const repository = vi.hoisted(() => ({ getPackageVersion: vi.fn(), getPackageById: vi.fn(), listCatalog: vi.fn() }));
vi.mock("../../../apps/web/lib/authoring", () => ({ getAuthoringRepository: () => repository }));
const personalModule = "../../../apps/web/lib/personal.ts";
const syncModule = "../../../apps/web/lib/solution-sync.ts";
const communityModule = "../../../apps/web/lib/community.ts";
const { changePersonal, readPersonal, publicPersonalProfile } = await import(personalModule);
const { readSolutionDraft, saveSolutionDraft } = await import(syncModule);
const { contribute, listCommunity, moderateContribution, reportContribution, communityReviewQueue } = await import(communityModule);
const alice: Actor = { id: "alice", handle: "alice", role: "user" };
const bob: Actor = { id: "bob", handle: "bob", role: "user" };
const admin: Actor = { id: "admin", handle: "admin", role: "admin" };
const problem = seedProblems[0]!;
const identity = { problemId: problem.id, version: problem.version, runtime: "typescript" as const };
const snapshot: SolutionSnapshot = { source: "private source", preferences: { fontSize: 14, wordWrap: true, split: 42, resultHeight: 34, customTests: "private tests" } };
async function currentRevision(postId: string) {
  return (await listCommunity(problem.id, problem.version, admin)).find((post: { id: string }) => post.id === postId)!.updatedAt;
}
beforeEach(() => {
  for (const name of ["__silogiumPersonal", "__silogiumSyncedDrafts", "__silogiumCommunityPosts", "__silogiumCommunityReports", "__silogiumCommunityWrites"]) (globalThis as Record<string, unknown>)[name] && ((globalThis as Record<string, unknown>)[name] as Map<string, unknown>).clear();
  vi.clearAllMocks();
  repository.listCatalog.mockResolvedValue(seedProblems);
  repository.getPackageVersion.mockResolvedValue({ problem });
  repository.getPackageById.mockImplementation(async (id: string) => seedProblems.find((item) => item.id === id) ? { problem: seedProblems.find((item) => item.id === id) } : undefined);
});
describe("biblioteca privada e sincronização", () => {
  it("separa usuários, exige opt-in público e filtra todos os campos privados", async () => {
    await changePersonal(alice, 0, { kind: "favorite", problemId: problem.id, saved: true });
    expect((await readPersonal(bob)).favorites).toEqual([]);
    expect(await publicPersonalProfile("alice")).toBeNull();
    const profile = { displayName: "Alice", bio: "Olá", website: "https://example.org", shared: true };
    await changePersonal(alice, 1, { kind: "profile", profile });
    expect(await publicPersonalProfile("alice")).toEqual({ handle: "alice", displayName: "Alice", bio: "Olá", website: "https://example.org" });
    await changePersonal(alice, 2, { kind: "profile", profile: { ...profile, shared: false } });
    expect(await publicPersonalProfile("alice")).toBeNull();
  });
  it("CAS concorrente não sobrescreve biblioteca nem rascunho", async () => {
    const mutations = await Promise.allSettled([changePersonal(alice, 0, { kind: "favorite", problemId: problem.id, saved: true }), changePersonal(alice, 0, { kind: "favorite", problemId: seedProblems[1]!.id, saved: true })]);
    expect(mutations.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect((await readPersonal(alice)).revision).toBe(1);
    await saveSolutionDraft(alice, identity, 0, snapshot);
    await expect(saveSolutionDraft(alice, identity, 0, { ...snapshot, source: "stale overwrite" })).rejects.toThrow(/CONFLICT/);
    expect((await readSolutionDraft(alice, identity))?.snapshot.source).toBe("private source");
    expect(await readSolutionDraft(bob, identity)).toBeNull();
    expect(await readSolutionDraft(alice, { ...identity, version: 2 })).toBeNull();
    repository.getPackageVersion.mockResolvedValue(undefined);
    await expect(readSolutionDraft(alice, identity)).rejects.toThrow(/não disponível/);
  });
});
describe("contribuições moderadas", () => {
  it("protege pendentes e motivos, exige admin e remodera edições", async () => {
    const post = await contribute(problem.id, problem.version, alice, { kind: "hint", title: "Primeira dica", body: "Use uma estrutura de consulta." });
    expect(await listCommunity(problem.id, problem.version, bob)).toEqual([]);
    expect(await listCommunity(problem.id, problem.version)).toEqual([]);
    await expect(moderateContribution(post.id, bob, "approve", "", post.updatedAt)).rejects.toThrow(/administradores/);
    await moderateContribution(post.id, admin, "approve", "Revisão privada", post.updatedAt);
    const publicPosts = await listCommunity(problem.id, problem.version);
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).not.toHaveProperty("authorId"); expect(publicPosts[0]).not.toHaveProperty("reason");
    await contribute(problem.id, problem.version, alice, { kind: "hint", title: "Outra dica", body: "Use um dicionário." }, post.id, publicPosts[0]!.updatedAt);
    expect(await listCommunity(problem.id, problem.version, bob)).toEqual([]);
  });
  it("remove de forma irrecuperável na publicação, sem autorizar outra conta ou versão", async () => {
    const post = await contribute(problem.id, problem.version, alice, { kind: "discussion", title: "Dúvida", body: "Como interpretar o exemplo?" });
    await expect(moderateContribution(post.id, bob, "remove", "", post.updatedAt)).rejects.toThrow(/administradores/);
    await expect(moderateContribution(post.id, alice, "remove", "", post.updatedAt, { problemId: problem.id, version: 99 })).rejects.toThrow(/nesta versão/);
    await moderateContribution(post.id, alice, "remove", "", post.updatedAt);
    expect(await listCommunity(problem.id, problem.version, alice)).toEqual([]);
    await expect(moderateContribution(post.id, admin, "approve", "", post.updatedAt)).rejects.toThrow(/removidas/);
  });
  it("denúncias exigem post público e não expõem o denunciante", async () => {
    const post = await contribute(problem.id, problem.version, alice, { kind: "solution", title: "Uma solução", body: "Minha explicação para resolver." });
    await expect(reportContribution(problem.id, problem.version, post.id, bob, "Conteúdo incorreto")).rejects.toThrow(/não encontrada/);
    await moderateContribution(post.id, admin, "approve", "", post.updatedAt);
    await reportContribution(problem.id, problem.version, post.id, bob, "Conteúdo incorreto");
    const queue = await communityReviewQueue(admin);
    expect(queue[0].reports).toEqual([{ reason: "Conteúdo incorreto" }]);
    await expect(communityReviewQueue(alice)).rejects.toThrow(/administradores/);
    await moderateContribution(post.id, admin, "reject", "Favor corrigir o exemplo.", await currentRevision(post.id));
    expect(await communityReviewQueue(admin)).toEqual([]);
  });
  it("limita também edições repetidas e recusa questões privadas", async () => {
    const input = { kind: "discussion", title: "Discussão", body: "Texto com uma dúvida." };
    const post = await contribute(problem.id, problem.version, alice, input);
    for (let i = 0; i < 4; i++) await contribute(problem.id, problem.version, alice, input, post.id, await currentRevision(post.id));
    await expect(contribute(problem.id, problem.version, alice, input, post.id, await currentRevision(post.id))).rejects.toThrow(/Limite/);
    repository.listCatalog.mockResolvedValue([]);
    await expect(contribute(problem.id, problem.version, alice, input)).rejects.toThrow(/públicas/);
  });
  it("não publica texto editado depois da versão lida pelo administrador", async () => {
    const seen = await contribute(problem.id, problem.version, alice, { kind: "hint", title: "Texto A", body: "Conteúdo revisado pelo administrador." });
    const updated = await contribute(problem.id, problem.version, alice, { kind: "hint", title: "Texto B", body: "Conteúdo novo ainda não revisado." }, seen.id, seen.updatedAt);
    await expect(moderateContribution(seen.id, admin, "approve", "", seen.updatedAt)).rejects.toThrow(/^CONFLICT:/);
    expect(await listCommunity(problem.id, problem.version)).toEqual([]);
    expect((await listCommunity(problem.id, problem.version, alice))[0]).toMatchObject({ title: "Texto B", status: "pending" });
    await moderateContribution(seen.id, admin, "approve", "", updated.updatedAt);
    expect((await listCommunity(problem.id, problem.version))[0]).toMatchObject({ title: "Texto B", status: "approved" });
  });
  it("edição e remoção exigem exatamente a revisão observada pelo autor", async () => {
    const input = { kind: "discussion", title: "Dúvida inicial", body: "Texto da primeira aba." };
    const seen = await contribute(problem.id, problem.version, alice, input);
    const updated = await contribute(problem.id, problem.version, alice, { ...input, body: "Atualização salva na segunda aba." }, seen.id, seen.updatedAt);
    await expect(contribute(problem.id, problem.version, alice, input, seen.id, seen.updatedAt)).rejects.toThrow(/^CONFLICT:/);
    await expect(contribute(problem.id, problem.version, alice, input, seen.id)).rejects.toThrow(/^CONFLICT:/);
    await expect(moderateContribution(seen.id, alice, "remove", "", seen.updatedAt)).rejects.toThrow(/^CONFLICT:/);
    expect((await listCommunity(problem.id, problem.version, alice))[0]).toMatchObject({ body: "Atualização salva na segunda aba.", updatedAt: updated.updatedAt });
  });
  it("duas decisões concorrentes para a mesma revisão não se sobrescrevem", async () => {
    const seen = await contribute(problem.id, problem.version, alice, { kind: "discussion", title: "Questão de CAS", body: "Texto para uma única decisão." });
    const attempts = await Promise.allSettled([
      moderateContribution(seen.id, admin, "approve", "", seen.updatedAt),
      moderateContribution(seen.id, admin, "reject", "Corrigir o exemplo.", seen.updatedAt)
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ message: expect.stringMatching(/^CONFLICT:/) }) });
  });
});
