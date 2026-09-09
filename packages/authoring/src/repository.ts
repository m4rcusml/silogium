import { canReadProblem, problemFingerprint, problemOwnerId, searchCatalog, seedProblems, transitionProblem, type Actor, type ProblemDefinition } from "@silogium/core";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthoringJob, AuthoringRepository, GeneratedPackage } from "./types.js";

export class MemoryAuthoringRepository implements AuthoringRepository {
  private readonly jobs = new Map<string, AuthoringJob>();
  private readonly packages = new Map<string, GeneratedPackage>();
  private readonly publishedPackages = new Map<string, GeneratedPackage>();

  async listCatalog(): Promise<ProblemDefinition[]> {
    return searchCatalog([...seedProblems, ...[...this.publishedPackages.values()].map((item) => item.problem)], {});
  }

  async saveJob(job: AuthoringJob): Promise<void> { this.jobs.set(job.id, structuredClone(job)); }
  async getJob(jobId: string): Promise<AuthoringJob | null> { return structuredClone(this.jobs.get(jobId) ?? null); }

  async savePackage(value: GeneratedPackage): Promise<void> {
    if (value.problem.provenance.kind === "licensed_import") {
      const sourceUrl = value.problem.provenance.sourceUrl;
      const existingSource = [...this.packages.values()].find((item) => {
        const provenance = item.problem.provenance;
        return provenance.kind === "licensed_import" && provenance.sourceUrl === sourceUrl;
      });
      if (existingSource) throw new Error(`Esta fonte já foi importada como ${existingSource.problem.title}.`);
    }
    const fingerprint = problemFingerprint(value.problem);
    const duplicate = [...seedProblems.map((problem) => ({ problem })), ...this.packages.values()]
      .find((item) => problemFingerprint(item.problem) === fingerprint && item.problem.id !== value.problem.id);
    if (duplicate) throw new Error(`Questão potencialmente duplicada de ${duplicate.problem.title}.`);
    if (value.problem.visibility === "unlisted" && !value.accessKey) value.accessKey = randomBytes(24).toString("base64url");
    this.packages.set(value.problem.id, structuredClone(value));
    if (value.problem.status === "published") this.publishedPackages.set(value.problem.id, structuredClone(value));
  }

  async saveRevision(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage> {
    const current = this.packages.get(value.problem.id);
    const published = this.publishedPackages.get(value.problem.id);
    if (!current || !published) throw new Error("Somente questões já publicadas podem receber uma nova versão.");
    if (problemOwnerId(current.problem) !== actor.id && actor.role !== "admin") throw new Error("Somente o autor pode alterar a questão.");
    if (value.problem.slug !== current.problem.slug || value.problem.version !== current.problem.version + 1) throw new Error("Identidade ou número da nova versão inválido.");
    if (problemOwnerId(value.problem) !== problemOwnerId(current.problem)) throw new Error("A autoria não pode ser alterada.");
    const revision = structuredClone({ ...value, problem: { ...value.problem, status: "validated" as const } });
    this.packages.set(value.problem.id, revision);
    return structuredClone(revision);
  }

  async requestPublication(problemId: string, actor: Actor): Promise<void> {
    const current = this.packages.get(problemId);
    if (!current) throw new Error("Questão não encontrada.");
    if (problemOwnerId(current.problem) !== actor.id && actor.role !== "admin") {
      throw new Error("Somente o autor pode solicitar publicação.");
    }
    current.problem = transitionProblem(current.problem, "pending_review", actor);
    this.packages.set(problemId, current);
  }

  async getPackageById(problemId: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.id === problemId);
    if (seed) return { problem: structuredClone(seed), bundle: { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: { valid: true, checks: [] } };
    const latest = this.packages.get(problemId);
    const published = this.publishedPackages.get(problemId);
    const hasLink = Boolean(latest && accessKey && latest.accessKey && this.sameSecret(accessKey, latest.accessKey));
    const value = latest && (actor?.role === "admin" || problemOwnerId(latest.problem) === actor?.id || hasLink) ? latest : published;
    return value && canReadProblem(value.problem, actor, hasLink) ? structuredClone(value) : null;
  }

  async getPackageBySlug(slug: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.slug === slug);
    if (seed) return { problem: structuredClone(seed), bundle: { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: { valid: true, checks: [] } };
    const latest = [...this.packages.values()].find((item) => item.problem.slug === slug);
    if (!latest) return null;
    const published = this.publishedPackages.get(latest.problem.id);
    const hasLink = Boolean(accessKey && latest.accessKey && this.sameSecret(accessKey, latest.accessKey));
    const value = actor?.role === "admin" || problemOwnerId(latest.problem) === actor?.id || hasLink ? latest : published;
    return value && canReadProblem(value.problem, actor, hasLink) ? structuredClone(value) : null;
  }

  async listForActor(actor: Actor): Promise<GeneratedPackage[]> {
    return [...this.packages.values()].filter((item) => actor.role === "admin" || problemOwnerId(item.problem) === actor.id).map((item) => structuredClone(item));
  }

  async listPending(actor: Actor): Promise<GeneratedPackage[]> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    return [...this.packages.values()].filter((item) => item.problem.status === "pending_review").map((item) => structuredClone(item));
  }

  async moderate(problemId: string, decision: "approve" | "reject", actor: Actor, _reason?: string): Promise<GeneratedPackage> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    const current = this.packages.get(problemId);
    if (!current) throw new Error("Questão não encontrada.");
    current.problem = transitionProblem(current.problem, decision === "approve" ? "published" : "rejected", actor);
    this.packages.set(problemId, current);
    if (decision === "approve") this.publishedPackages.set(problemId, structuredClone(current));
    return structuredClone(current);
  }

  private sameSecret(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
  }
}

const globalStore = globalThis as typeof globalThis & { __silogiumAuthoringRepository?: MemoryAuthoringRepository };
export const memoryAuthoringRepository = globalStore.__silogiumAuthoringRepository ??= new MemoryAuthoringRepository();
