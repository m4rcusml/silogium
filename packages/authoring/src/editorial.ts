import { JudgeBundleSchema, ProblemDefinitionSchema, buildProblemMetadata, problemOwnerId, type Actor } from "@silogium/core";
import type { AuthoringRepository, GeneratedPackage, ProblemValidator, ValidationReport } from "./types.js";
import type { EditorialRecord, EditorialView, SaveEditorialDraft } from "./editorial-types.js";

const emptyValidation: ValidationReport = { valid: false, checks: [], warnings: ["Rascunho ainda não validado."] };
const MAX_DRAFT_BYTES = 2_000_000;
const assertRevision = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error("Revisão inválida."); };

export class ProblemEditorial {
  constructor(private readonly repository: AuthoringRepository, private readonly validator: ProblemValidator) {}

  private async load(slug: string, actor: Actor): Promise<EditorialRecord> {
    const source = await this.repository.getPackageBySlug(slug, actor);
    if (!source || (problemOwnerId(source.problem) !== actor.id && actor.role !== "admin")) throw new Error("Questão editorial não encontrada.");
    const saved = await this.repository.getEditorialRecord(source.problem.id);
    if (saved) return saved;
    return {
      problemId: source.problem.id, revision: 0, baseVersion: source.problem.version, phase: "draft",
      package: this.nextVersion(source), updatedAt: new Date().toISOString(), spoilersViewedBy: []
    };
  }

  private nextVersion(source: GeneratedPackage): GeneratedPackage {
    const problem = { ...structuredClone(source.problem), version: source.problem.version + 1, status: "draft" as const, updatedAt: new Date().toISOString() };
    return { problem, bundle: { ...structuredClone(source.bundle), problemVersion: problem.version }, validation: structuredClone(emptyValidation) };
  }

  private async view(record: EditorialRecord, actor: Actor, reveal = false): Promise<EditorialView> {
    const { problem, bundle, validation } = record.package;
    return {
      revision: record.revision, baseVersion: record.baseVersion, phase: record.phase,
      problem: structuredClone(problem), visibleCases: structuredClone(bundle.visibleCases), validation: structuredClone(validation),
      reviews: await this.repository.listEditorialReviews(record.problemId),
      spoilersRevealed: reveal,
      ...(reveal ? { spoilers: { hiddenCases: structuredClone(bundle.hiddenCases), referenceSolutions: structuredClone(bundle.referenceSolutions) } } : {})
    };
  }

  async open(slug: string, actor: Actor, options: { revealSpoilers?: boolean } = {}): Promise<EditorialView> {
    let record = await this.load(slug, actor);
    if (options.revealSpoilers && !record.spoilersViewedBy.includes(actor.id)) {
      if (record.phase === "validating") throw new Error("A validação está em andamento. Aguarde antes de revelar o material de autoria.");
      const next = { ...record, revision: record.revision + 1, spoilersViewedBy: [...record.spoilersViewedBy, actor.id], updatedAt: new Date().toISOString() };
      if (!await this.repository.saveEditorialRecord(next, record.revision)) throw new Error("O rascunho mudou em outra aba. Recarregue antes de revelar os materiais.");
      record = next;
    }
    return this.view(record, actor, options.revealSpoilers === true);
  }

  /** Internal provider input; callers must never return it through a conversation DTO. */
  async getDraftForRefinement(slug: string, actor: Actor) {
    const record = await this.load(slug, actor);
    if (record.phase === "validating") throw new Error("A validação está em andamento. Aguarde antes de pedir um refinamento; nenhuma operação de IA foi consumida.");
    return { revision: record.revision, problem: structuredClone(record.package.problem), bundle: structuredClone(record.package.bundle) };
  }

  async saveGeneratedDraft(slug: string, actor: Actor, input: { expectedRevision: number } & Pick<GeneratedPackage, "problem" | "bundle">) {
    return this.save(slug, actor, { expectedRevision: input.expectedRevision, content: input.problem, visibleCases: input.bundle.visibleCases, spoilers: input.bundle }, true);
  }

  /** Server-only staging: the durable worker commits this record and its job in one transaction. */
  async prepareGeneratedDraft(slug: string, actor: Actor, input: { expectedRevision: number } & Pick<GeneratedPackage, "problem" | "bundle">) {
    const record = await this.prepareSave(slug, actor, { expectedRevision: input.expectedRevision, content: input.problem, visibleCases: input.bundle.visibleCases, spoilers: input.bundle }, true);
    return { record, expectedRevision: input.expectedRevision };
  }

  async saveDraft(slug: string, actor: Actor, input: SaveEditorialDraft) {
    return this.save(slug, actor, input, false);
  }

  private async save(slug: string, actor: Actor, input: SaveEditorialDraft, trustedPrivate: boolean): Promise<EditorialView> {
    const next = await this.prepareSave(slug, actor, input, trustedPrivate);
    if (!await this.repository.saveEditorialRecord(next, input.expectedRevision)) throw new Error("O rascunho mudou em outra aba. Recarregue antes de salvar.");
    return this.view(next, actor, Boolean(input.spoilers) && !trustedPrivate);
  }

  private async prepareSave(slug: string, actor: Actor, input: SaveEditorialDraft, trustedPrivate: boolean): Promise<EditorialRecord> {
    if (!input || typeof input !== "object" || !input.content || typeof input.content !== "object" || !Array.isArray(input.visibleCases)) throw new Error("Informe o conteúdo e os testes visíveis do rascunho.");
    assertRevision(input.expectedRevision);
    if (JSON.stringify(input).length > MAX_DRAFT_BYTES) throw new Error("O rascunho excede o limite de 2 MB.");
    const record = await this.load(slug, actor);
    if (record.revision !== input.expectedRevision) throw new Error("O rascunho mudou em outra aba. Recarregue para não sobrescrever alterações.");
    if (record.phase === "validating") throw new Error("A validação está em andamento. Aguarde antes de editar.");
    if (input.spoilers && !trustedPrivate && !record.spoilersViewedBy.includes(actor.id)) throw new Error("Revele explicitamente o material de autoria antes de alterar gabaritos ou testes ocultos.");
    // An already materialized version is immutable. Editing it starts a new working version.
    const base = record.phase === "validated" ? this.nextVersion(record.package) : record.package;
    const content = input.content;
    const problem = ProblemDefinitionSchema.parse({ ...base.problem,
      title: content.title, summary: content.summary, difficulty: content.difficulty, tags: content.tags,
      stages: content.stages, runtimes: content.runtimes, examples: content.examples, limits: content.limits,
      status: "draft", updatedAt: new Date().toISOString()
    });
    const originalRuntimes = base.problem.runtimes.map((item) => item.language).sort().join(",");
    if (problem.runtimes.map((item) => item.language).sort().join(",") !== originalRuntimes) throw new Error("Esta edição deve preservar as linguagens existentes.");
    problem.runtimes = problem.runtimes.map((runtime) => ({ ...runtime, version: base.problem.runtimes.find((item) => item.language === runtime.language)!.version }));
    if (problem.runtimes.some((runtime) => runtime.starterCode.length > 200_000)) throw new Error("Starter excede o limite de tamanho.");
    problem.metadata = buildProblemMetadata(problem);
    const bundle = JudgeBundleSchema.parse({ ...base.bundle, problemId: problem.id, problemVersion: problem.version, visibleCases: input.visibleCases,
      ...(input.spoilers ? { hiddenCases: input.spoilers.hiddenCases, referenceSolutions: input.spoilers.referenceSolutions } : {}) });
    if (Object.values(bundle.referenceSolutions).some((source) => source && source.length > 200_000)) throw new Error("Referência excede o limite de tamanho.");
    const next: EditorialRecord = { ...record, revision: record.revision + 1, baseVersion: record.phase === "validated" ? record.package.problem.version : record.baseVersion, phase: "draft", package: { problem, bundle, validation: structuredClone(emptyValidation) }, updatedAt: problem.updatedAt };
    return next;
  }

  async validateDraft(slug: string, actor: Actor, expectedRevision: number): Promise<EditorialView> {
    assertRevision(expectedRevision);
    const record = await this.load(slug, actor);
    if (record.revision !== expectedRevision) throw new Error("O rascunho mudou. Recarregue antes de validar.");
    if (record.phase === "validated") return this.view(record, actor);
    if (record.phase === "validating" && Date.now() - Date.parse(record.updatedAt) < 10 * 60_000) throw new Error("Esta versão já está sendo validada. Consulte novamente para acompanhar.");
    const claimed: EditorialRecord = { ...record, revision: record.revision + 1, phase: "validating", updatedAt: new Date().toISOString() };
    if (!await this.repository.saveEditorialRecord(claimed, record.revision)) throw new Error("Outra validação já começou. Recarregue o rascunho.");
    let validation: ValidationReport;
    try { validation = await this.validator.validate(claimed.package.problem, claimed.package.bundle); }
    catch { validation = { valid: false, checks: [{ name: "execução da validação", passed: false, message: "Não foi possível concluir a validação. O rascunho foi preservado; tente novamente." }] }; }
    const next: EditorialRecord = { ...claimed, revision: claimed.revision + 1, phase: validation.valid ? "validated" : "draft", updatedAt: new Date().toISOString(), package: { ...claimed.package, validation, problem: { ...claimed.package.problem, status: validation.valid ? "validated" : "draft" } } };
    if (validation.valid) {
      try { await this.repository.commitEditorialVersion(next, claimed.revision, actor); }
      catch (error) {
        await this.repository.saveEditorialRecord({ ...next, phase: "draft", package: { ...next.package, problem: { ...next.package.problem, status: "draft" }, validation: { ...validation, valid: false, checks: [...validation.checks, { name: "persistência da versão", passed: false, message: "A versão não foi materializada. Consulte o rascunho e tente novamente." }] } } }, claimed.revision);
        throw error;
      }
    }
    else if (!await this.repository.saveEditorialRecord(next, claimed.revision)) throw new Error("O rascunho foi atualizado durante a validação. Consulte a versão atual.");
    return this.view(next, actor);
  }

  async submitPublication(slug: string, actor: Actor, expectedRevision: number, licensesAccepted: boolean): Promise<EditorialView> {
    if (!licensesAccepted) throw new Error("Confirme as licenças e a atribuição antes de solicitar publicação.");
    const record = await this.load(slug, actor);
    if (record.revision !== expectedRevision || record.phase !== "validated" || !record.package.validation.valid) throw new Error("Salve e valide a versão atual antes de publicá-la.");
    await this.repository.requestPublication(record.problemId, actor, record.package.problem.version);
    return this.view(record, actor);
  }

  async moderate(reviewId: string, decision: "approve" | "reject", actor: Actor, reason?: string) {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    if (decision !== "approve" && decision !== "reject") throw new Error("Decisão inválida.");
    if (decision === "reject" && (!reason?.trim() || reason.trim().length < 5)) throw new Error("Explique o motivo da rejeição para orientar a correção (mínimo de 5 caracteres).");
    if ((reason?.length ?? 0) > 2_000) throw new Error("O motivo deve ter até 2000 caracteres.");
    return this.repository.moderateReview(reviewId, decision, actor, reason?.trim());
  }
}
