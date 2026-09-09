import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  canReadProblem,
  problemFingerprint,
  problemOwnerId,
  seedProblems,
  transitionProblem,
  type Actor,
  type ProblemDefinition
} from "@silogium/core";
import type {
  AuthoringJob,
  AuthoringRepository,
  GeneratedPackage,
  ValidationReport
} from "@silogium/authoring";
import { createSupabaseAdminClient } from "./admin";

type ProblemRow = {
  id: string;
  slug: string;
  owner_id: string | null;
  visibility: ProblemDefinition["visibility"];
  status: ProblemDefinition["status"];
  current_version: number;
  latest_version: number;
  unlisted_access_hash: string | null;
};

const emptyValidation: ValidationReport = { valid: true, checks: [] };

function fail(message: string, error?: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameHash(value: string | undefined, expected: string | null): boolean {
  if (!value || !expected) return false;
  const actual = Buffer.from(hash(value), "hex");
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function publicJob(job: AuthoringJob) {
  if (job.result?.kind !== "create") return job.result ?? null;
  return {
    kind: "create",
    package: {
      problem: job.result.package.problem,
      validation: job.result.package.validation,
      accessKey: job.result.package.accessKey
    }
  };
}

export class SupabaseAuthoringRepository implements AuthoringRepository {
  private client() {
    const client = createSupabaseAdminClient();
    if (!client) throw new Error("Supabase de servidor não configurado.");
    return client;
  }

  async listCatalog(): Promise<ProblemDefinition[]> {
    const client = this.client();
    const { data, error } = await client.from("problems").select("id,current_version").eq("status", "published").eq("visibility", "public");
    if (error) fail("Não foi possível ler o catálogo", error);
    const persisted = await Promise.all((data ?? []).map((row) => this.readDefinition(row.id, row.current_version)));
    const byId = new Map(seedProblems.map((problem) => [problem.id, problem]));
    persisted.filter(Boolean).forEach((problem) => byId.set(problem!.id, problem!));
    return [...byId.values()];
  }

  async saveJob(job: AuthoringJob): Promise<void> {
    const { error } = await this.client().from("ai_jobs").upsert({
      id: job.id,
      user_id: job.actorId,
      mode: job.request.mode,
      status: job.status,
      request: job.request,
      result: publicJob(job),
      error: job.error ?? null,
      created_at: job.createdAt,
      completed_at: job.completedAt ?? null
    });
    if (error) fail("Não foi possível salvar o trabalho de IA", error);
  }

  async getJob(jobId: string): Promise<AuthoringJob | null> {
    const { data, error } = await this.client().from("ai_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) fail("Não foi possível ler o trabalho de IA", error);
    if (!data) return null;
    return {
      id: data.id,
      actorId: data.user_id,
      status: data.status,
      request: data.request,
      createdAt: data.created_at,
      completedAt: data.completed_at ?? undefined,
      result: data.result ?? undefined,
      error: data.error ?? undefined
    } as AuthoringJob;
  }

  async savePackage(value: GeneratedPackage): Promise<void> {
    const client = this.client();
    const problem = value.problem;
    const ownerId = problemOwnerId(problem) ?? null;
    if (problem.visibility === "unlisted" && !value.accessKey) value.accessKey = randomBytes(24).toString("base64url");
    const row = {
      id: problem.id,
      slug: problem.slug,
      owner_id: ownerId,
      origin: problem.origin,
      visibility: problem.visibility,
      status: problem.status,
      current_version: problem.version,
      latest_version: problem.version,
      title: problem.title,
      summary: problem.summary,
      difficulty: problem.difficulty,
      format: problem.format,
      runtimes: problem.runtimes.map((runtime) => runtime.language),
      tags: problem.tags,
      source_url: problem.provenance.kind === "licensed_import" ? problem.provenance.sourceUrl : null,
      fingerprint: problemFingerprint(problem),
      unlisted_access_hash: value.accessKey ? hash(value.accessKey) : null,
      created_at: problem.createdAt,
      updated_at: problem.updatedAt
    };
    const inserted = await client.from("problems").insert(row);
    if (inserted.error) fail("Não foi possível salvar a questão", inserted.error);
    const version = await client.from("problem_versions").insert({ problem_id: problem.id, version: problem.version, definition: problem, created_by: ownerId });
    if (version.error) {
      await client.from("problems").delete().eq("id", problem.id);
      fail("Não foi possível salvar a versão da questão", version.error);
    }
    const bundle = await client.schema("private").from("judge_bundles").insert({
      problem_id: problem.id,
      problem_version: problem.version,
      bundle: value.bundle,
      checksum: hash(JSON.stringify(value.bundle))
    });
    if (bundle.error) fail("Não foi possível guardar o bundle privado", bundle.error);
    if (problem.provenance.kind === "licensed_import") {
      const source = await client.from("problem_sources").insert({
        problem_id: problem.id,
        source_name: problem.provenance.sourceName,
        source_url: problem.provenance.sourceUrl,
        license_spdx: problem.provenance.licenseSpdx,
        authors: problem.provenance.authors,
        commit_sha: problem.provenance.commitSha ?? null,
        retrieved_at: problem.provenance.retrievedAt,
        metadata: {
          repositoryUrl: problem.provenance.repositoryUrl,
          licenseUrl: problem.provenance.licenseUrl,
          contributors: problem.provenance.contributors,
          importedBy: problem.provenance.importedBy,
          importedByHandle: problem.provenance.importedByHandle
        }
      });
      if (source.error) fail("Não foi possível salvar a atribuição da fonte", source.error);
    }
    if (problem.status === "pending_review" && ownerId) {
      const review = await client.from("publication_reviews").insert({
        problem_id: problem.id,
        problem_version: problem.version,
        requested_by: ownerId
      });
      if (review.error) fail("Não foi possível abrir a revisão editorial", review.error);
    }
  }

  async saveRevision(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage> {
    const client = this.client();
    const row = await this.readRow(value.problem.id);
    if (!row || row.status !== "published") throw new Error("Somente questões já publicadas podem receber uma nova versão.");
    const latest = await this.readDefinition(row.id, row.latest_version);
    if (!latest) throw new Error("Versão atual não encontrada.");
    if (problemOwnerId(latest) !== actor.id && actor.role !== "admin") throw new Error("Somente o autor pode alterar a questão.");
    if (value.problem.slug !== latest.slug || value.problem.version !== row.latest_version + 1) throw new Error("Identidade ou número da nova versão inválido.");
    if (problemOwnerId(value.problem) !== problemOwnerId(latest)) throw new Error("A autoria não pode ser alterada.");

    const revision = { ...value, problem: { ...value.problem, status: "validated" as const } };
    const version = await client.from("problem_versions").insert({
      problem_id: row.id,
      version: revision.problem.version,
      definition: revision.problem,
      created_by: actor.id
    });
    if (version.error) fail("Não foi possível salvar a nova versão", version.error);
    const bundle = await client.schema("private").from("judge_bundles").insert({
      problem_id: row.id,
      problem_version: revision.problem.version,
      bundle: revision.bundle,
      checksum: hash(JSON.stringify(revision.bundle))
    });
    if (bundle.error) {
      await client.from("problem_versions").delete().eq("problem_id", row.id).eq("version", revision.problem.version);
      fail("Não foi possível guardar o bundle da nova versão", bundle.error);
    }
    const update = await client.from("problems").update({ latest_version: revision.problem.version, updated_at: revision.problem.updatedAt }).eq("id", row.id);
    if (update.error) fail("Não foi possível ativar a nova versão de trabalho", update.error);
    return revision;
  }

  async requestPublication(problemId: string, actor: Actor): Promise<void> {
    const current = await this.readRow(problemId);
    if (!current) throw new Error("Questão não encontrada.");
    if (current.owner_id !== actor.id && actor.role !== "admin") throw new Error("Somente o autor pode solicitar publicação.");
    const problem = await this.readDefinition(current.id, current.latest_version);
    if (!problem) throw new Error("Versão da questão não encontrada.");
    const updated = transitionProblem(problem, "pending_review", actor);
    const client = this.client();
    const updateValues = current.status === "published"
      ? { updated_at: updated.updatedAt }
      : { status: "pending_review" as const, updated_at: updated.updatedAt };
    const update = await client.from("problems").update(updateValues).eq("id", problemId);
    if (update.error) fail("Não foi possível solicitar publicação", update.error);
    const definition = await client.from("problem_versions").update({ definition: updated }).eq("problem_id", problemId).eq("version", problem.version);
    if (definition.error) fail("Não foi possível atualizar a versão editorial", definition.error);
    const review = await client.from("publication_reviews").insert({ problem_id: problemId, problem_version: problem.version, requested_by: actor.id });
    if (review.error) fail("Não foi possível abrir a revisão editorial", review.error);
  }

  async getPackageById(problemId: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.id === problemId);
    if (seed) {
      const persisted = await this.readPrivateBundle(seed.id, seed.version);
      return { problem: seed, bundle: persisted ?? { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: emptyValidation };
    }
    const row = await this.readRow(problemId);
    if (!row) return null;
    const hasLink = sameHash(accessKey, row.unlisted_access_hash);
    const isOwner = actor?.role === "admin" || row.owner_id === actor?.id;
    const problem = await this.readDefinition(row.id, isOwner || hasLink ? row.latest_version : row.current_version);
    if (!problem || !canReadProblem(problem, actor, hasLink)) return null;
    return this.readPackage(problem);
  }

  async getPackageBySlug(slug: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.slug === slug);
    if (seed) {
      const persisted = await this.readPrivateBundle(seed.id, seed.version);
      return { problem: seed, bundle: persisted ?? { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: emptyValidation };
    }
    const { data, error } = await this.client().from("problems").select("id,slug,owner_id,visibility,status,current_version,latest_version,unlisted_access_hash").eq("slug", slug).maybeSingle();
    if (error) fail("Não foi possível ler a questão", error);
    if (!data) return null;
    const row = data as ProblemRow;
    const hasLink = sameHash(accessKey, row.unlisted_access_hash);
    const isOwner = actor?.role === "admin" || row.owner_id === actor?.id;
    const problem = await this.readDefinition(row.id, isOwner || hasLink ? row.latest_version : row.current_version);
    if (!problem || !canReadProblem(problem, actor, hasLink)) return null;
    return this.readPackage(problem);
  }

  async listForActor(actor: Actor): Promise<GeneratedPackage[]> {
    const query = this.client().from("problems").select("id,latest_version");
    const { data, error } = actor.role === "admin" ? await query : await query.eq("owner_id", actor.id);
    if (error) fail("Não foi possível listar suas questões", error);
    return Promise.all((data ?? []).map(async (row) => {
      const problem = await this.readDefinition(row.id, row.latest_version);
      if (!problem) throw new Error("Versão ausente.");
      return this.readPackage(problem);
    }));
  }

  async listPending(actor: Actor): Promise<GeneratedPackage[]> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    const { data, error } = await this.client().from("publication_reviews").select("problem_id,problem_version").eq("status", "pending");
    if (error) fail("Não foi possível listar revisões", error);
    return Promise.all((data ?? []).map(async (row) => {
      const problem = await this.readDefinition(row.problem_id, row.problem_version);
      if (!problem) throw new Error("Versão ausente.");
      return this.readPackage(problem);
    }));
  }

  async moderate(problemId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    const row = await this.readRow(problemId);
    if (!row) throw new Error("Questão não encontrada.");
    const { data: review, error: reviewError } = await this.client().from("publication_reviews")
      .select("problem_version")
      .eq("problem_id", problemId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reviewError) fail("Não foi possível ler a revisão pendente", reviewError);
    const reviewedVersion = review?.problem_version ?? row.latest_version;
    const current = await this.readDefinition(row.id, reviewedVersion);
    if (!current) throw new Error("Versão da questão não encontrada.");
    const updated = transitionProblem(current, decision === "approve" ? "published" : "rejected", actor);
    const client = this.client();
    const result = await client.from("problems").update(decision === "approve" ? {
      status: updated.status,
      visibility: updated.visibility,
      current_version: reviewedVersion,
      latest_version: Math.max(row.latest_version, reviewedVersion),
      title: updated.title,
      summary: updated.summary,
      difficulty: updated.difficulty,
      format: updated.format,
      runtimes: updated.runtimes.map((runtime) => runtime.language),
      tags: updated.tags,
      fingerprint: problemFingerprint(updated),
      updated_at: updated.updatedAt
    } : row.current_version === reviewedVersion && row.status !== "published" ? {
      status: "rejected",
      updated_at: updated.updatedAt
    } : {
      updated_at: updated.updatedAt
    }).eq("id", problemId);
    if (result.error) fail("Não foi possível concluir a revisão", result.error);
    const definition = await client.from("problem_versions").update({ definition: updated }).eq("problem_id", problemId).eq("version", reviewedVersion);
    if (definition.error) fail("Não foi possível atualizar a versão publicada", definition.error);
    await client.from("publication_reviews").update({
      status: decision === "approve" ? "approved" : "rejected",
      reason: reason ?? null,
      reviewer_id: actor.id,
      reviewed_at: new Date().toISOString()
    }).eq("problem_id", problemId).eq("problem_version", reviewedVersion).eq("status", "pending");
    return this.readPackage(updated);
  }

  private async readRow(problemId: string): Promise<ProblemRow | null> {
    const { data, error } = await this.client().from("problems").select("id,slug,owner_id,visibility,status,current_version,latest_version,unlisted_access_hash").eq("id", problemId).maybeSingle();
    if (error) fail("Não foi possível ler a questão", error);
    return data as ProblemRow | null;
  }

  private async readDefinition(problemId: string, version: number): Promise<ProblemDefinition | null> {
    const { data, error } = await this.client().from("problem_versions").select("definition").eq("problem_id", problemId).eq("version", version).maybeSingle();
    if (error) fail("Não foi possível ler a versão da questão", error);
    return (data?.definition ?? null) as ProblemDefinition | null;
  }

  private async readPackage(problem: ProblemDefinition): Promise<GeneratedPackage> {
    const bundle = await this.readPrivateBundle(problem.id, problem.version);
    if (!bundle) throw new Error("Bundle do judge ausente.");
    return { problem, bundle, validation: emptyValidation } as GeneratedPackage;
  }

  private async readPrivateBundle(problemId: string, version: number): Promise<GeneratedPackage["bundle"] | null> {
    const { data, error } = await this.client().schema("private").from("judge_bundles").select("bundle").eq("problem_id", problemId).eq("problem_version", version).maybeSingle();
    if (error) fail("Não foi possível ler o bundle do judge", error);
    return (data?.bundle ?? null) as GeneratedPackage["bundle"] | null;
  }
}
