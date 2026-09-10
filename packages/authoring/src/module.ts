import { ContentRequestSchema, RuntimeSchema, buildProblemMetadata, rankSimilarCandidates, type Actor, type ContentRequest, type Runtime } from "@silogium/core";
import type { AiAuthoringAdapter, AuthoringJob, AuthoringRepository, GeneratedPackage, LicensedSourceAdapter, ProblemAuthoring, ProblemValidator, SearchCandidate } from "./types.js";
import { deduplicateCandidates, discoverKnown, discoveryContext, externalCandidates } from "./discovery.js";
import { licensedProvenance } from "./licensed-provenance.js";
import { MemoryConversationRepository, conversationContext, parseAuthoringRequest, requestText, type AuthoringRequest, type ConversationRepository } from "./conversation.js";
import { ProblemEditorial } from "./editorial.js";
import { randomBytes } from "node:crypto";
import type { AuthoringQueue, JobLease, JobOutcome, JobWork } from "./durable-jobs.js";

export class ProblemAuthoringModule implements ProblemAuthoring {
  constructor(
    private readonly repository: AuthoringRepository,
    private readonly ai: AiAuthoringAdapter,
    private readonly licensedSources: LicensedSourceAdapter[],
    private readonly validator: ProblemValidator,
    private readonly background = false,
    private readonly beforeAi: (actor: Actor) => Promise<void> = async () => {},
    readonly conversations: ConversationRepository = new MemoryConversationRepository(),
    private readonly editorial = new ProblemEditorial(repository, validator),
    private readonly queue?: AuthoringQueue
  ) {}

  async request(rawInput: AuthoringRequest, actor: Actor): Promise<{ jobId: string; conversationId: string }> {
    const input = parseAuthoringRequest(rawInput);
    const conversation = input.conversationId ? await this.conversations.get(input.conversationId, actor) : await this.conversations.create(actor, requestText(input));
    if (!conversation) throw new Error("Conversa não encontrada.");
    input.conversationId = conversation.id;
    const job: AuthoringJob = { id: crypto.randomUUID(), actorId: actor.id, status: "running", request: input, createdAt: new Date().toISOString() };
    if (this.queue) {
      await this.queue.enqueue(job, actor, this.conversationTurn(job, actor));
      return { jobId: job.id, conversationId: conversation.id };
    }
    await this.repository.saveJob(job);
    await this.saveConversationTurn(job, actor);
    const processing = this.processJob(job, actor);
    if (this.background) void processing;
    else await processing;
    return { jobId: job.id, conversationId: conversation.id };
  }

  async confirmCreation(jobId: string, actor: Actor): Promise<{ jobId: string }> {
    const existing = await this.repository.getJob(jobId);
    if (!existing || existing.actorId !== actor.id || existing.request.mode !== "create") throw new Error("Pedido de criação não encontrado.");
    // Retries after a lost response observe the same job; they never start another generation.
    if (existing.status === "running" || (existing.status === "completed" && existing.result?.kind === "create")) return { jobId };
    if (existing.status !== "needs_confirmation") throw new Error("Este pedido não aguarda confirmação. Faça um novo pedido para tentar novamente.");
    if (this.queue) {
      await this.queue.confirm(jobId, actor.id);
      return { jobId };
    }
    const confirmedInput = parseAuthoringRequest(existing.request);
    const claimed = await this.repository.claimConfirmation(jobId, actor.id);
    if (!claimed) return { jobId };
    claimed.request = confirmedInput;
    claimed.status = "running";
    const processing = this.processJob(claimed, actor, true);
    if (this.background) void processing;
    else await processing;
    return { jobId };
  }

  /** Worker entry point. No externally visible writes happen before queue.finish(). */
  async processQueuedJob(lease: JobLease, work: JobWork): Promise<JobOutcome> {
    const job = structuredClone(lease.job);
    delete job.error;
    delete job.result;
    delete job.completedAt;
    await this.processJob(job, lease.actor, lease.confirmed, work);
    return { job, effects: work.effects, turn: this.conversationTurn(job, lease.actor) };
  }

  private async processJob(job: AuthoringJob, actor: Actor, confirmed = false, work?: JobWork): Promise<void> {
    const request = job.request;
    const step = <T>(key: string, compute: () => Promise<T>) => work ? work.step(key, compute) : compute();
    const beforeAi = () => work ? work.beforeAi() : this.beforeAi(actor);
    try {
      const context = request.conversationId && await this.conversations.get(request.conversationId, actor)
        ? conversationContext((await this.conversations.listTurns(request.conversationId, actor, { limit: 5 })).items, job.id) : [];
      const input = request.mode === "import" || request.mode === "refine" ? request : ContentRequestSchema.parse(request);
      if (input.mode === "import") {
        const value = await this.importLicensed(input.sourceName, input.slug, input.runtime, actor, work);
        job.result = { kind: "create", package: value };
      } else if (input.mode === "refine") {
        const draft = await this.editorial.getDraftForRefinement(input.slug, actor);
        if (draft.revision !== input.expectedRevision) throw new Error("O rascunho mudou. Reabra a versão mais recente antes de pedir outro refinamento.");
        if (!this.ai.refine) throw new Error("O provedor atual não oferece refinamento de rascunhos.");
        await beforeAi();
        const refined = await step("refined", () => this.ai.refine!({ prompt: input.prompt, problem: draft.problem, bundle: draft.bundle }, actor, context));
        if (refined.problem.runtimes.map((item) => item.language).sort().join(",") !== draft.problem.runtimes.map((item) => item.language).sort().join(",")
          || draft.problem.runtimes.some((item) => !refined.bundle.referenceSolutions[item.language])) throw new Error("O refinamento não preservou todas as linguagens e referências. O rascunho anterior permanece intacto.");
        refined.problem = { ...refined.problem, id: draft.problem.id, version: draft.problem.version, slug: draft.problem.slug,
          provenance: draft.problem.provenance, origin: draft.problem.origin, visibility: draft.problem.visibility,
          format: draft.problem.format, executionModel: draft.problem.executionModel, createdAt: draft.problem.createdAt };
        refined.bundle = { ...refined.bundle, problemId: draft.problem.id, problemVersion: draft.problem.version };
        const validation = await step("refinement-validation", () => this.validator.validate(refined.problem, refined.bundle));
        if (work) {
          work.effects.editorial = await this.editorial.prepareGeneratedDraft(input.slug, actor, { expectedRevision: input.expectedRevision, ...refined });
          const saved = work.effects.editorial.record;
          job.result = { kind: "refine", slug: saved.package.problem.slug, title: saved.package.problem.title, revision: saved.revision, validation };
        } else {
          const saved = await this.editorial.saveGeneratedDraft(input.slug, actor, { expectedRevision: input.expectedRevision, ...refined });
          job.result = { kind: "refine", slug: saved.problem.slug, title: saved.problem.title, revision: saved.revision, validation };
        }
      } else {
      const known = await step("known", () => discoverKnown(this.repository, input, actor));
      if (input.mode === "create" && !confirmed && known.length) {
        job.status = "needs_confirmation";
        job.result = { kind: "recommendations", candidates: known.slice(0, 5) };
        if (!work) { await this.repository.saveJob(job); await this.saveConversationTurn(job, actor); }
        return;
      }
      await beforeAi();
      if (input.mode === "search") {
        const sourceResults = await Promise.allSettled(this.licensedSources.map((source) => source.search(input.prompt, input.runtime)));
        const licensed = externalCandidates(sourceResults.flatMap((result) => result.status === "fulfilled" ? result.value : []), input.runtime, true);
        if (sourceResults.some((result) => result.status === "rejected")) job.error = "Uma fonte licenciada não respondeu. Exibindo as outras fontes disponíveis.";
        let external: SearchCandidate[] = [];
        try {
          external = externalCandidates(await step("web-search", () => this.ai.searchWeb(input.prompt, input.runtime, actor, discoveryContext(known), context)), input.runtime);
        } catch (error) {
          if (!known.length && !licensed.length) throw error;
          job.error = "A busca na web não respondeu. Exibindo questões e fontes já disponíveis.";
        }
        const candidates = deduplicateCandidates([...licensed, ...external]);
        if (work) work.effects.candidates = candidates;
        else await this.repository.saveExternalCandidates(actor, candidates);
        const merged = deduplicateCandidates([...known, ...licensed, ...external]);
        const ranked = rankSimilarCandidates(input, merged);
        // New web results may have sparse metadata. Keep them as clearly external suggestions.
        const rankedIds = new Set(ranked.map((candidate) => candidate.id));
        job.result = { kind: "search", candidates: [...ranked, ...merged.filter((candidate) => !rankedIds.has(candidate.id))].slice(0, 7) };
      } else {
        let generated = await step("generated", () => this.ai.create(input, actor, discoveryContext(known), context));
        let validation = await step("generation-validation", () => this.validator.validate(generated.problem, generated.bundle));
        if (!validation.valid && this.ai.repair) {
          generated = await step("repaired", () => this.ai.repair!(input, actor, generated, validation));
          validation = await step("repair-validation", () => this.validator.validate(generated.problem, generated.bundle));
        }
        generated.problem.status = validation.valid ? (input.visibility === "public" ? "pending_review" : "validated") : "rejected";
        generated.problem.metadata = buildProblemMetadata(generated.problem);
        const value = { ...generated, validation };
        if (work) {
          if (value.problem.visibility === "unlisted") Object.assign(value, { accessKey: randomBytes(24).toString("base64url") });
          work.effects.package = value;
        } else await this.repository.savePackage(value);
        job.result = { kind: "create", package: value };
      }
      }
      job.status = "completed";
      job.completedAt = new Date().toISOString();
    } catch (error) {
      if (work) throw error;
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Falha desconhecida.";
      job.completedAt = new Date().toISOString();
    }
    if (work) return;
    await this.repository.saveJob(job);
    // History failure must not turn an already persisted question into a failed generation.
    try { await this.saveConversationTurn(job, actor); } catch { /* The job remains directly recoverable without resubmitting code or a prompt. */ }
  }

  private conversationTurn(job: AuthoringJob, actor: Actor) {
    const conversationId = job.request.conversationId;
    if (!conversationId) return;
    const result = job.result;
    const assistantText = job.status === "failed" ? "O pedido não foi concluído. Consulte seus detalhes para decidir o próximo passo."
      : result?.kind === "create" ? `Questão salva: ${result.package.problem.title}. ${result.package.validation.valid ? "Validação concluída." : "A validação encontrou pontos para revisar."}`
      : result?.kind === "refine" ? `Rascunho refinado: ${result.title}. Revisão ${result.revision}; revise e valide antes de usar a nova versão.`
      : result?.kind === "search" ? `${result.candidates.length} sugestões encontradas: ${result.candidates.slice(0, 3).map((candidate) => candidate.title).join("; ")}.`
      : result?.kind === "recommendations" ? "Encontrei questões semelhantes. A criação de outra questão aguarda sua confirmação."
      : "Pedido recebido e em processamento.";
    return { id: job.id, jobId: job.id, conversationId, actorId: actor.id, mode: job.request.mode,
      userText: requestText(job.request).slice(0, 2_000), assistantText: assistantText.slice(0, 700), status: job.status,
      createdAt: job.createdAt, updatedAt: job.completedAt ?? new Date().toISOString() };
  }

  private async saveConversationTurn(job: AuthoringJob, actor: Actor): Promise<void> {
    const turn = this.conversationTurn(job, actor);
    if (turn) await this.conversations.saveTurn(turn, actor);
  }

  async getJob(jobId: string, actor: Actor) {
    const job = await this.repository.getJob(jobId);
    return job?.actorId === actor.id ? job : null;
  }
  async requestPublication(problemId: string, actor: Actor) { return this.repository.requestPublication(problemId, actor); }

  async revise(value: GeneratedPackage, actor: Actor) {
    const validation = await this.validator.validate(value.problem, value.bundle);
    if (!validation.valid) throw new Error("A nova versão não passou pela validação automática.");
    return this.repository.saveRevision({ ...value, problem: { ...value.problem, metadata: buildProblemMetadata(value.problem), status: "validated" }, validation }, actor);
  }

  async importLicensed(sourceName: string, slug: string, rawRuntime: Runtime, actor: Actor, work?: JobWork) {
    if (this.queue && !work) throw new Error("Use um pedido de importação assíncrono; a importação será executada pelo worker.");
    const step = <T>(key: string, compute: () => Promise<T>) => work ? work.step(key, compute) : compute();
    const runtime = RuntimeSchema.parse(rawRuntime);
    if (sourceName.toLowerCase() !== "exercism" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Fonte ou exercício inválido.");
    const sourceUrl = `https://github.com/exercism/${runtime}/tree/main/exercises/practice/${slug}`;
    const reusable = (await this.repository.listDiscoveryProblems(actor)).find((problem) => problem.provenance.kind === "licensed_import"
      && problem.provenance.sourceUrl === sourceUrl && problem.runtimes.some((definition) => definition.language === runtime));
    if (reusable) {
      const existing = await this.repository.getPackageVersion(reusable.id, reusable.version, actor);
      if (existing) return existing;
    }
    const source = this.licensedSources.find((candidate) => candidate.load && sourceName.toLowerCase() === "exercism");
    if (!source?.load) throw new Error("Fonte licenciada não suportada.");
    const loaded = await step("source-snapshot", () => source.load!(slug, runtime));
    if (work) await work.beforeAi(); else await this.beforeAi(actor);
    const generated = await step("imported", () => this.ai.importLicensed(loaded, actor));
    generated.problem.origin = "licensed_import";
    generated.problem.provenance = licensedProvenance(loaded, actor);
    generated.problem.visibility = "private";
    if (!generated.problem.runtimes.some((definition) => definition.language === runtime)) throw new Error("A conversão não preservou a linguagem solicitada.");
    const validation = await step("import-validation", () => this.validator.validate(generated.problem, generated.bundle));
    generated.problem.status = validation.valid ? "validated" : "rejected";
    generated.problem.metadata = buildProblemMetadata(generated.problem);
    const value = { ...generated, validation };
    if (work) work.effects.package = value;
    else await this.repository.savePackage(value);
    return value;
  }
}
