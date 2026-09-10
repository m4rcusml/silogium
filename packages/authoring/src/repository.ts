import { buildCandidateMetadata, buildProblemMetadata, canonicalExternalUrl, canReadProblem, problemFingerprint, problemOwnerId, searchCatalog, seedProblems, transitionProblem, type Actor, type ProblemDefinition } from "@silogium/core";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthoringJob, AuthoringRepository, GeneratedPackage, SearchCandidate } from "./types.js";
import type { EditorialRecord, EditorialReview } from "./editorial-types.js";
import type { JobOutcome } from "./durable-jobs.js";

function withMetadata(problem: ProblemDefinition): ProblemDefinition {
  return { ...problem, metadata: problem.metadata ?? buildProblemMetadata(problem) };
}

/** Only source summaries belong in this cache; scores and reasons belong to each query. */
export function persistableExternalCandidate(candidate: SearchCandidate): SearchCandidate | null {
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.kind !== "external_link" && candidate.kind !== "licensed_import") return null;
  if ([candidate.id, candidate.url, candidate.title, candidate.summary, candidate.sourceName].some((value) => typeof value !== "string")) return null;
  const canonical = canonicalExternalUrl(candidate.url);
  if (!canonical || canonical.length > 2_048) return null;
  const url = new URL(canonical);
  if (!candidate.id.trim() || !candidate.title.trim() || !candidate.summary.trim() || !candidate.sourceName.trim() || !["typescript", "python"].includes(candidate.runtime)) return null;
  const licensed = candidate.kind === "licensed_import"
    && candidate.sourceName === "Exercism"
    && candidate.licenseSpdx === "MIT"
    && url.origin === "https://github.com"
    && new RegExp(`^/exercism/${candidate.runtime}/tree/main/exercises/practice/[a-z0-9-]+/?$`).test(url.pathname);
  if (candidate.kind === "licensed_import" && !licensed) return null;
  return {
    id: candidate.id.slice(0, 200),
    kind: licensed ? "licensed_import" : "external_link",
    title: candidate.title.slice(0, 300),
    summary: candidate.summary.slice(0, 1_200),
    url: url.href,
    sourceName: candidate.sourceName.slice(0, 120),
    runtime: candidate.runtime,
    importable: licensed,
    ...(licensed ? { licenseSpdx: "MIT" } : {}),
    metadata: buildCandidateMetadata(candidate),
    ...(typeof candidate.retrievedAt === "string" && Number.isFinite(Date.parse(candidate.retrievedAt)) ? { retrievedAt: candidate.retrievedAt } : {}),
    ...(["easy", "medium", "hard"].includes(candidate.difficulty ?? "") ? { difficulty: candidate.difficulty } : {}),
    ...(candidate.format === "classic" || candidate.format === "progressive" ? { format: candidate.format } : {})
  };
}

export class MemoryAuthoringRepository implements AuthoringRepository {
  private readonly jobs = new Map<string, AuthoringJob>();
  private readonly packages = new Map<string, GeneratedPackage>();
  private readonly publishedPackages = new Map<string, GeneratedPackage>();
  private externalCandidates: Map<string, Map<string, SearchCandidate>> | undefined = new Map();
  private editorialRecords: Map<string, EditorialRecord> | undefined = new Map();
  private versions: Map<string, GeneratedPackage> | undefined = new Map();
  private reviews: Map<string, EditorialReview> | undefined = new Map();

  private remember(value: GeneratedPackage) {
    const versions = this.versions ??= new Map();
    versions.set(`${value.problem.id}:${value.problem.version}`, structuredClone(value));
  }

  private ensureHistory() {
    this.versions ??= new Map();
    this.reviews ??= new Map();
    for (const value of [...this.publishedPackages.values(), ...this.packages.values()]) {
      const key = `${value.problem.id}:${value.problem.version}`;
      if (!this.versions.has(key)) this.remember(value);
      if (value.problem.status === "pending_review" && ![...this.reviews.values()].some((review) => review.problemId === value.problem.id && review.problemVersion === value.problem.version)) this.openReview(value);
    }
  }

  private openReview(value: GeneratedPackage) {
    const reviews = this.reviews ??= new Map();
    if ([...reviews.values()].some((review) => review.problemId === value.problem.id && review.problemVersion === value.problem.version && review.status === "pending")) return;
    const review: EditorialReview = { id: crypto.randomUUID(), problemId: value.problem.id, problemVersion: value.problem.version, requestedBy: problemOwnerId(value.problem) ?? "unknown", status: "pending", createdAt: new Date().toISOString() };
    reviews.set(review.id, review);
  }

  async getEditorialRecord(problemId: string): Promise<EditorialRecord | null> {
    return structuredClone((this.editorialRecords ??= new Map()).get(problemId) ?? null);
  }

  async saveEditorialRecord(record: EditorialRecord, expectedRevision: number): Promise<boolean> {
    const records = this.editorialRecords ??= new Map();
    if ((records.get(record.problemId)?.revision ?? 0) !== expectedRevision || record.revision !== expectedRevision + 1) return false;
    records.set(record.problemId, structuredClone(record));
    return true;
  }

  async commitEditorialVersion(record: EditorialRecord, expectedRevision: number, actor: Actor): Promise<void> {
    const records = this.editorialRecords ??= new Map();
    const current = this.packages.get(record.problemId);
    if (!current || (problemOwnerId(current.problem) !== actor.id && actor.role !== "admin")) throw new Error("Questão editorial não encontrada.");
    if (records.get(record.problemId)?.revision !== expectedRevision || record.revision !== expectedRevision + 1 || current.problem.version !== record.baseVersion) throw new Error("A versão mudou durante a validação. Recarregue antes de continuar.");
    const value = record.package;
    if (value.problem.id !== current.problem.id || value.problem.version !== current.problem.version + 1 || value.problem.slug !== current.problem.slug || JSON.stringify(value.problem.provenance) !== JSON.stringify(current.problem.provenance) || !value.validation.valid) throw new Error("Revisão editorial inválida.");
    const duplicate = [...seedProblems, ...[...this.packages.values()].map((item) => item.problem)].some((problem) => problem.id !== value.problem.id && problemFingerprint(problem) === problemFingerprint(value.problem));
    if (duplicate) throw new Error("Questão potencialmente duplicada de um conteúdo existente.");
    this.remember(current);
    const committed = structuredClone({ ...value, accessKey: current.accessKey });
    this.packages.set(record.problemId, committed);
    this.remember(committed);
    records.set(record.problemId, structuredClone(record));
  }

  async listEditorialReviews(problemId: string): Promise<EditorialReview[]> {
    this.ensureHistory();
    return [...this.reviews!.values()].filter((review) => review.problemId === problemId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => structuredClone(item));
  }

  async getPackageVersion(problemId: string, version: number, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    if (!Number.isSafeInteger(version) || version < 1) return null;
    const seed = seedProblems.find((problem) => problem.id === problemId && problem.version === version);
    if (seed) return this.getPackageById(problemId, actor, accessKey);
    this.ensureHistory();
    const current = this.packages.get(problemId);
    const published = this.publishedPackages.get(problemId);
    const historical = this.versions!.get(`${problemId}:${version}`);
    if (!current || !historical) return null;
    const owns = actor?.role === "admin" || (actor && problemOwnerId(current.problem) === actor.id);
    const link = Boolean(accessKey && current.accessKey && this.sameSecret(accessKey, current.accessKey));
    const wasPublished = historical.problem.status === "published" || [...this.reviews!.values()].some((review) => review.problemId === problemId && review.problemVersion === version && review.status === "approved");
    if (!owns && !(published?.problem.visibility === "public" && wasPublished) && !(current.problem.visibility === "unlisted" && link && ["validated", "pending_review", "published"].includes(historical.problem.status))) return null;
    return structuredClone(historical);
  }

  async listCatalog(): Promise<ProblemDefinition[]> {
    return searchCatalog([...seedProblems, ...[...this.publishedPackages.values()].map((item) => item.problem)], {}).map((problem) => structuredClone(withMetadata(problem)));
  }

  async listDiscoveryProblems(actor: Actor): Promise<ProblemDefinition[]> {
    const byId = new Map((await this.listCatalog()).map((problem) => [problem.id, problem]));
    for (const { problem } of this.packages.values()) {
      if (problemOwnerId(problem) === actor.id && ["validated", "pending_review", "published"].includes(problem.status)) {
        byId.set(problem.id, withMetadata(problem));
      }
    }
    return [...byId.values()].map((problem) => structuredClone(problem));
  }

  async listExternalCandidates(actor: Actor): Promise<SearchCandidate[]> {
    const externalCandidates = this.externalCandidates ??= new Map();
    return [...(externalCandidates.get(actor.id)?.values() ?? [])].map((candidate) => structuredClone(candidate));
  }

  async saveExternalCandidates(actor: Actor, candidates: SearchCandidate[]): Promise<void> {
    this.storeExternalCandidates(actor, candidates);
  }

  private storeExternalCandidates(actor: Actor, candidates: SearchCandidate[]): void {
    const externalCandidates = this.externalCandidates ??= new Map();
    const stored = externalCandidates.get(actor.id) ?? new Map<string, SearchCandidate>();
    for (const candidate of candidates) {
      const safe = persistableExternalCandidate(candidate);
      if (safe) stored.set(JSON.stringify([safe.url, safe.runtime]), structuredClone(safe));
    }
    externalCandidates.set(actor.id, stored);
  }

  async saveJob(job: AuthoringJob): Promise<void> { this.jobs.set(job.id, structuredClone(job)); }
  async getJob(jobId: string): Promise<AuthoringJob | null> { return structuredClone(this.jobs.get(jobId) ?? null); }

  async claimConfirmation(jobId: string, actorId: string): Promise<AuthoringJob | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.actorId !== actorId || job.status !== "needs_confirmation") return null;
    // No await between the check and state change: only one concurrent caller can claim it.
    const original = structuredClone(job);
    this.jobs.set(jobId, { ...job, status: "running" });
    return original;
  }

  async savePackage(value: GeneratedPackage): Promise<void> {
    this.storePackage(value);
  }

  private storePackage(value: GeneratedPackage): void {
    if (this.packages.has(value.problem.id) || seedProblems.some((problem) => problem.id === value.problem.id)) throw new Error("A questão já existe. Use uma revisão para preservar o histórico.");
    value.problem = withMetadata(value.problem);
    if (value.problem.provenance.kind === "licensed_import") {
      const sourceUrl = value.problem.provenance.sourceUrl;
      const existingSource = [...this.packages.values()].find((item) => {
        const provenance = item.problem.provenance;
        return provenance.kind === "licensed_import" && provenance.sourceUrl === sourceUrl;
      });
      if (existingSource) throw new Error("Esta fonte já foi importada. Procure a versão disponível no catálogo ou nas suas questões.");
    }
    const fingerprint = problemFingerprint(value.problem);
    const duplicate = [...seedProblems.map((problem) => ({ problem })), ...this.packages.values()]
      .find((item) => problemFingerprint(item.problem) === fingerprint && item.problem.id !== value.problem.id);
    if (duplicate) throw new Error("Questão potencialmente duplicada de um conteúdo existente.");
    if (value.problem.visibility === "unlisted" && !value.accessKey) value.accessKey = randomBytes(24).toString("base64url");
    this.packages.set(value.problem.id, structuredClone(value));
    this.remember(value);
    if (value.problem.status === "pending_review") this.openReview(value);
    if (value.problem.status === "published") this.publishedPackages.set(value.problem.id, structuredClone(value));
  }

  /** Synchronous memory transaction: no await between validation, content and terminal job. */
  commitQueuedOutcome(outcome: JobOutcome, actor: Actor): void {
    const { effects, job } = outcome;
    if (job.actorId !== actor.id || Object.values(effects).filter((value) => value !== undefined).length > 1) throw new Error("Invalid job effects.");
    if (effects.package) {
      if (problemOwnerId(effects.package.problem) !== actor.id) throw new Error("Package ownership mismatch.");
      this.storePackage(effects.package);
    }
    if (effects.editorial) {
      const { record, expectedRevision } = effects.editorial;
      const owner = this.packages.get(record.problemId);
      const records = this.editorialRecords ??= new Map();
      if (!owner || (problemOwnerId(owner.problem) !== actor.id && actor.role !== "admin")) throw new Error("Editorial access denied.");
      if ((records.get(record.problemId)?.revision ?? 0) !== expectedRevision || record.revision !== expectedRevision + 1) throw new Error("Editorial revision conflict.");
      records.set(record.problemId, structuredClone(record));
    }
    if (effects.candidates) this.storeExternalCandidates(actor, effects.candidates);
    this.jobs.set(job.id, structuredClone(job));
  }

  async saveRevision(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage> {
    const current = this.packages.get(value.problem.id);
    const published = this.publishedPackages.get(value.problem.id);
    if (!current || !published) throw new Error("Somente questões já publicadas podem receber uma nova versão.");
    if (problemOwnerId(current.problem) !== actor.id && actor.role !== "admin") throw new Error("Somente o autor pode alterar a questão.");
    if (value.problem.slug !== current.problem.slug || value.problem.version !== current.problem.version + 1) throw new Error("Identidade ou número da nova versão inválido.");
    if (JSON.stringify(value.problem.provenance) !== JSON.stringify(current.problem.provenance) || value.problem.origin !== current.problem.origin) throw new Error("A autoria, a origem e a licença não podem ser alteradas.");
    const revision = structuredClone({ ...value, problem: { ...value.problem, metadata: buildProblemMetadata(value.problem), status: "validated" as const } });
    this.remember(current);
    this.packages.set(value.problem.id, revision);
    this.remember(revision);
    return structuredClone(revision);
  }

  async requestPublication(problemId: string, actor: Actor, expectedVersion?: number): Promise<void> {
    const current = this.packages.get(problemId);
    if (!current) throw new Error("Questão não encontrada.");
    if (problemOwnerId(current.problem) !== actor.id && actor.role !== "admin") {
      throw new Error("Somente o autor pode solicitar publicação.");
    }
    if (expectedVersion !== undefined && current.problem.version !== expectedVersion) throw new Error("A versão mudou. Recarregue antes de solicitar publicação.");
    if (current.problem.status === "pending_review") return;
    if (!current.validation.valid) throw new Error("Revalide a questão antes de solicitar publicação.");
    for (const [id, review] of this.reviews ?? []) if (review.problemId === problemId && review.status === "pending") this.reviews!.set(id, { ...review, status: "rejected", reason: "Substituída por uma versão mais recente enviada pelo autor.", reviewedAt: new Date().toISOString() });
    current.problem = transitionProblem(current.problem, "pending_review", actor);
    this.packages.set(problemId, current);
    this.remember(current);
    this.openReview(current);
  }

  async getPackageById(problemId: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.id === problemId);
    if (seed) return { problem: structuredClone(withMetadata(seed)), bundle: { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: { valid: true, checks: [] } };
    const latest = this.packages.get(problemId);
    const published = this.publishedPackages.get(problemId);
    const hasLink = Boolean(latest && accessKey && latest.accessKey && this.sameSecret(accessKey, latest.accessKey));
    const value = latest && (actor?.role === "admin" || problemOwnerId(latest.problem) === actor?.id || hasLink) ? latest : published;
    return value && canReadProblem(value.problem, actor, hasLink) ? structuredClone({ ...value, problem: withMetadata(value.problem) }) : null;
  }

  async getPackageBySlug(slug: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.slug === slug);
    if (seed) return { problem: structuredClone(withMetadata(seed)), bundle: { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: { valid: true, checks: [] } };
    const latest = [...this.packages.values()].find((item) => item.problem.slug === slug);
    if (!latest) return null;
    const published = this.publishedPackages.get(latest.problem.id);
    const hasLink = Boolean(accessKey && latest.accessKey && this.sameSecret(accessKey, latest.accessKey));
    const value = actor?.role === "admin" || problemOwnerId(latest.problem) === actor?.id || hasLink ? latest : published;
    return value && canReadProblem(value.problem, actor, hasLink) ? structuredClone({ ...value, problem: withMetadata(value.problem) }) : null;
  }

  async listForActor(actor: Actor): Promise<GeneratedPackage[]> {
    return [...this.packages.values()].filter((item) => actor.role === "admin" || problemOwnerId(item.problem) === actor.id).map((item) => structuredClone({ ...item, problem: withMetadata(item.problem) }));
  }

  async listPending(actor: Actor): Promise<GeneratedPackage[]> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    this.ensureHistory();
    return [...this.reviews!.values()].filter((review) => review.status === "pending").flatMap((review) => {
      const value = this.versions!.get(`${review.problemId}:${review.problemVersion}`);
      return value ? [structuredClone({ ...value, editorialReview: review })] : [];
    });
  }

  async moderate(problemId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    const review = (await this.listEditorialReviews(problemId)).find((item) => item.status === "pending");
    if (!review) throw new Error("Revisão pendente não encontrada.");
    return this.moderateReview(review.id, decision, actor, reason);
  }

  async moderateReview(reviewId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    if (decision === "reject" && (!reason?.trim() || reason.trim().length < 5)) throw new Error("Informe o motivo da rejeição.");
    this.ensureHistory();
    const review = this.reviews!.get(reviewId);
    if (!review || review.status !== "pending") throw new Error("Esta revisão já foi concluída ou não existe.");
    const current = this.versions!.get(`${review.problemId}:${review.problemVersion}`);
    if (!current) throw new Error("Versão em revisão não encontrada.");
    if (decision === "approve" && (!current.validation.valid || (this.publishedPackages.get(review.problemId)?.problem.version ?? 0) > review.problemVersion)) throw new Error("Revisão desatualizada ou sem validação aprovada.");
    if (decision === "approve" && [...seedProblems, ...[...this.packages.values(), ...this.publishedPackages.values()].map((item) => item.problem)].some((problem) => problem.id !== current.problem.id && problemFingerprint(problem) === problemFingerprint(current.problem))) throw new Error("Questão potencialmente duplicada de um conteúdo existente.");
    const updated = structuredClone(current);
    updated.problem = transitionProblem(updated.problem, decision === "approve" ? "published" : "rejected", actor);
    if (this.packages.get(review.problemId)?.problem.version === review.problemVersion) this.packages.set(review.problemId, updated);
    if (decision === "approve") this.publishedPackages.set(review.problemId, structuredClone(updated));
    this.remember(updated);
    this.reviews!.set(reviewId, { ...review, status: decision === "approve" ? "approved" : "rejected", reviewerId: actor.id, reason: reason?.trim(), reviewedAt: new Date().toISOString() });
    return updated;
  }

  private sameSecret(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
  }
}

const globalStore = globalThis as typeof globalThis & {
  __silogiumMemoryAuthoringRepository?: MemoryAuthoringRepository;
  __silogiumAuthoringRepository?: unknown;
};
const previous = globalStore.__silogiumMemoryAuthoringRepository ?? globalStore.__silogiumAuthoringRepository;
const previousMaps = previous as { jobs?: unknown; packages?: unknown; publishedPackages?: unknown } | undefined;
const reusable = previousMaps?.jobs instanceof Map && previousMaps.packages instanceof Map && previousMaps.publishedPackages instanceof Map;
export const memoryAuthoringRepository = reusable ? previous as MemoryAuthoringRepository : new MemoryAuthoringRepository();
// Hot reload updates behavior without discarding the user's in-memory questions and jobs.
if (Object.getPrototypeOf(memoryAuthoringRepository) !== MemoryAuthoringRepository.prototype) {
  Object.setPrototypeOf(memoryAuthoringRepository, MemoryAuthoringRepository.prototype);
}
globalStore.__silogiumMemoryAuthoringRepository = memoryAuthoringRepository;
