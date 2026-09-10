import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@silogium/core";
import { ProblemEditorial } from "../src/editorial.js";
import { ProblemAuthoringModule } from "../src/module.js";
import { LocalAiAdapter } from "../src/local-ai.js";
import { MemoryAuthoringRepository } from "../src/repository.js";
import type { EditorialView } from "../src/editorial-types.js";
import type { ProblemValidator } from "../src/types.js";

const owner: Actor = { id: "owner", handle: "owner", role: "user" };
const stranger: Actor = { id: "stranger", handle: "stranger", role: "user" };
const admin: Actor = { id: "admin", handle: "admin", role: "admin" };
const approved = { valid: true, checks: [{ name: "referência", passed: true }] };
const valid: ProblemValidator = { validate: async () => structuredClone(approved) };

async function setup(status: "validated" | "published" | "rejected" = "validated", validator = valid) {
  const repository = new MemoryAuthoringRepository();
  const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "contagem e ordenação editorial", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "private" }, owner);
  generated.problem.status = status;
  if (status === "published") generated.problem.visibility = "public";
  await repository.savePackage({ ...generated, validation: approved });
  return { repository, editorial: new ProblemEditorial(repository, validator), slug: generated.problem.slug, original: generated };
}

const edit = (view: EditorialView, title = "Contagem revisada com clareza") => ({ expectedRevision: view.revision, content: { ...view.problem, title }, visibleCases: view.visibleCases });

describe("ciclo editorial", () => {
  it("oferece DTO sem gabarito e exige autorização mesmo para questões públicas", async () => {
    const { editorial, slug } = await setup("published");
    const view = await editorial.open(slug, owner);
    expect(view.spoilers).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("referenceSolutions");
    await expect(editorial.open(slug, stranger, { revealSpoilers: true })).rejects.toThrow(/não encontrada/);
    await expect(editorial.getDraftForRefinement(slug, stranger)).rejects.toThrow(/não encontrada/);
  });

  it("registra revelação explícita, mas não inclui spoilers em futuras aberturas normais", async () => {
    const { editorial, repository, slug, original } = await setup();
    const view = await editorial.open(slug, owner, { revealSpoilers: true });
    expect(view.spoilers?.referenceSolutions).toEqual(original.bundle.referenceSolutions);
    expect((await repository.getEditorialRecord(original.problem.id))?.spoilersViewedBy).toContain(owner.id);
    expect((await editorial.open(slug, owner)).spoilers).toBeUndefined();
  });

  it("bloqueia injeção de pacote privado sem opt-in e preserva identidade/proveniência", async () => {
    const { editorial, slug, original } = await setup();
    const view = await editorial.open(slug, owner);
    await expect(editorial.saveDraft(slug, owner, { ...edit(view), spoilers: original.bundle })).rejects.toThrow(/explicitamente/);
    const input = edit(view);
    input.content.id = crypto.randomUUID(); input.content.slug = "hijacked";
    input.content.provenance = { kind: "native", createdBy: stranger.id, assistedByAi: false, statementLicense: "CC-BY-4.0", codeLicense: "MIT" };
    const saved = await editorial.saveDraft(slug, owner, input);
    expect(saved.problem.id).toBe(original.problem.id);
    expect(saved.problem.slug).toBe(slug);
    expect(saved.problem.provenance).toEqual(original.problem.provenance);
    expect(saved.problem.status).toBe("draft");
  });

  it("duas abas não sobrescrevem o mesmo rascunho", async () => {
    const { editorial, slug } = await setup();
    const initial = await editorial.open(slug, owner);
    const results = await Promise.allSettled([editorial.saveDraft(slug, owner, edit(initial, "Primeira edição")), editorial.saveDraft(slug, owner, edit(initial, "Segunda edição"))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await editorial.open(slug, owner)).revision).toBe(1);
  });

  it.each(["validated", "rejected"] as const)("corrige primeira versão %s sem apagar o original", async (status) => {
    const { editorial, repository, slug, original } = await setup(status);
    const initial = await editorial.open(slug, owner);
    const saved = await editorial.saveDraft(slug, owner, edit(initial));
    expect((await repository.getPackageById(original.problem.id, owner))?.problem.version).toBe(1);
    const done = await editorial.validateDraft(slug, owner, saved.revision);
    expect(done.phase).toBe("validated");
    expect(done.problem.version).toBe(2);
    expect((await repository.getPackageVersion(original.problem.id, 1, owner))?.problem.title).toBe(original.problem.title);
    expect(await repository.getPackageVersion(original.problem.id, 1, stranger)).toBeNull();
    expect(await repository.getPackageVersion(original.problem.id, 2, stranger)).toBeNull();
  });

  it("mantém versão pública até aprovação e preserva histórico público autorizado", async () => {
    const { editorial, repository, slug, original } = await setup("published");
    const saved = await editorial.saveDraft(slug, owner, edit(await editorial.open(slug, owner)));
    const validated = await editorial.validateDraft(slug, owner, saved.revision);
    expect((await repository.getPackageById(original.problem.id))?.problem.version).toBe(1);
    expect(await repository.getPackageVersion(original.problem.id, 2)).toBeNull();
    await expect(editorial.submitPublication(slug, owner, validated.revision, false)).rejects.toThrow(/licenças/);
    await editorial.submitPublication(slug, owner, validated.revision, true);
    const pending = (await repository.listPending(admin))[0]!;
    expect(pending.editorialReview?.problemVersion).toBe(2);
    await editorial.moderate(pending.editorialReview!.id, "approve", admin);
    expect((await repository.getPackageById(original.problem.id))?.problem.version).toBe(2);
    expect((await repository.getPackageVersion(original.problem.id, 1))?.problem.title).toBe(original.problem.title);
    const next = await editorial.saveDraft(slug, owner, edit(await editorial.open(slug, owner), "Próxima edição privada"));
    await editorial.validateDraft(slug, owner, next.revision);
    expect((await repository.getPackageById(original.problem.id))?.problem.version).toBe(2);
    expect(await repository.getPackageVersion(original.problem.id, 3)).toBeNull();
  });

  it("rejeição exige motivo e orienta o autor; decisões repetidas não alteram a revisão", async () => {
    const { editorial, repository, slug, original } = await setup();
    await repository.requestPublication(original.problem.id, owner);
    const pending = (await repository.listPending(admin))[0]!.editorialReview!;
    await expect(editorial.moderate(pending.id, "approve", stranger)).rejects.toThrow(/administradores/);
    await expect(editorial.moderate(pending.id, "reject", admin, " ")).rejects.toThrow(/motivo/);
    await editorial.moderate(pending.id, "reject", admin, "Explique a ordem dos empates.");
    const view = await editorial.open(slug, owner);
    expect(view.reviews[0]).toMatchObject({ status: "rejected", reason: "Explique a ordem dos empates." });
    await expect(editorial.moderate(pending.id, "approve", admin)).rejects.toThrow(/concluída/);
  });

  it("falha de validação e infra preservam rascunho sem materializar ou publicar", async () => {
    const validator = { validate: vi.fn(async () => { throw new Error("internal secret diagnostics"); }) };
    const { editorial, repository, slug, original } = await setup("published", validator);
    const saved = await editorial.saveDraft(slug, owner, edit(await editorial.open(slug, owner)));
    const failed = await editorial.validateDraft(slug, owner, saved.revision);
    expect(failed.phase).toBe("draft");
    expect(failed.validation.valid).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("internal secret");
    expect((await repository.getPackageById(original.problem.id))?.problem.version).toBe(1);
  });

  it("uma validação concorrente é reivindicada uma única vez e bloqueia edição", async () => {
    let finish!: (report: typeof approved) => void;
    const validator = { validate: vi.fn(() => new Promise<typeof approved>((resolve) => { finish = resolve; })) };
    const { editorial, slug } = await setup("validated", validator);
    const saved = await editorial.saveDraft(slug, owner, edit(await editorial.open(slug, owner)));
    const first = editorial.validateDraft(slug, owner, saved.revision);
    await vi.waitFor(() => expect(validator.validate).toHaveBeenCalledTimes(1));
    const locked = await editorial.open(slug, owner);
    await expect(editorial.open(slug, owner, { revealSpoilers: true })).rejects.toThrow(/andamento/);
    await expect(editorial.getDraftForRefinement(slug, owner)).rejects.toThrow(/andamento/);
    await expect(editorial.saveDraft(slug, owner, edit(locked))).rejects.toThrow(/andamento/);
    await expect(editorial.validateDraft(slug, owner, locked.revision)).rejects.toThrow(/sendo validada/);
    finish(approved);
    expect((await first).phase).toBe("validated");
  });

  it("refinamento de um rascunho em validação não cobra cota nem chama o provedor", async () => {
    const { editorial, repository, slug, original } = await setup();
    const initial = await editorial.open(slug, owner);
    await repository.saveEditorialRecord({ problemId: original.problem.id, revision: 1, baseVersion: 1, phase: "validating", package: { problem: initial.problem, bundle: { ...original.bundle, problemVersion: 2 }, validation: approved }, updatedAt: new Date().toISOString(), spoilersViewedBy: [] }, 0);
    const refine = vi.fn(async () => original);
    const ai = Object.assign(new LocalAiAdapter(), { refine });
    const beforeAi = vi.fn(async () => {});
    const authoring = new ProblemAuthoringModule(repository, ai, [], valid, false, beforeAi);
    const { jobId } = await authoring.request({ mode: "refine", slug, prompt: "Esclareça a ordem dos empates.", expectedRevision: 1 }, owner);
    expect(await authoring.getJob(jobId, owner)).toMatchObject({ status: "failed", error: expect.stringContaining("validação está em andamento") });
    expect(beforeAi).not.toHaveBeenCalled();
    expect(refine).not.toHaveBeenCalled();
    expect((await editorial.open(slug, owner)).revision).toBe(1);
  });

  it("refinamento interno pode preservar materiais privados sem expor gabarito na resposta", async () => {
    const { editorial, slug, original } = await setup("published");
    const draft = await editorial.getDraftForRefinement(slug, owner);
    expect(draft.bundle.referenceSolutions).toEqual(original.bundle.referenceSolutions);
    const saved = await editorial.saveGeneratedDraft(slug, owner, { expectedRevision: draft.revision, problem: { ...draft.problem, title: "Refinamento interno" }, bundle: draft.bundle });
    expect(saved.spoilers).toBeUndefined();
    expect(saved.phase).toBe("draft");
    expect(saved.problem.provenance).toEqual(original.problem.provenance);
  });
});
