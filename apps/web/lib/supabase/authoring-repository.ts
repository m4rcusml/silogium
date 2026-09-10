import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  buildProblemMetadata,
  canReadProblem,
  problemFingerprint,
  problemOwnerId,
  seedProblems,
  type Actor,
  type ProblemDefinition
} from "@silogium/core";
import type {
  AuthoringJob,
  AuthoringRepository,
  GeneratedPackage,
  ValidationReport,
  SearchCandidate
} from "@silogium/authoring";
import type { EditorialRecord, EditorialReview } from "@silogium/authoring";
import { persistableExternalCandidate } from "@silogium/authoring";
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

const emptyValidation: ValidationReport = { valid: false, checks: [], warnings: ["Relatório de validação indisponível. Revalide antes de solicitar publicação."] };

function reviewFromRow(row: Record<string, unknown>): EditorialReview {
  return { id: row.id as string, problemId: row.problem_id as string, problemVersion: row.problem_version as number, requestedBy: row.requested_by as string, status: row.status as EditorialReview["status"], createdAt: row.created_at as string, ...(row.reason ? { reason: row.reason as string } : {}), ...(row.reviewer_id ? { reviewerId: row.reviewer_id as string } : {}), ...(row.reviewed_at ? { reviewedAt: row.reviewed_at as string } : {}) };
}

function fail(message: string, error?: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

function failDiscovery(message: string, error?: { message?: string; code?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205" || (error?.code === "22P02" && error.message?.includes("needs_confirmation"))) {
    throw new Error("A descoberta de questões requer a migração 202609090001_discovery_metadata.sql no Supabase. Aplique a migração antes de continuar.");
  }
  fail(message, error);
}

function withMetadata(problem: ProblemDefinition): ProblemDefinition {
  return { ...problem, metadata: problem.metadata ?? buildProblemMetadata(problem) };
}

function jobFromRow(data: Record<string, unknown>): AuthoringJob {
  return {
    id: data.id,
    actorId: data.user_id,
    status: data.status,
    request: data.request,
    createdAt: data.created_at,
    progress: data.progress ?? undefined,
    completedAt: data.completed_at ?? undefined,
    result: data.result ?? undefined,
    error: data.error ?? undefined
  } as AuthoringJob;
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

/** Parent visibility can revoke access without rewriting immutable version snapshots. */
function currentProblemAccess(row: ProblemRow, actor?: Actor, accessKey?: string) {
  const isOwner = actor?.role === "admin" || Boolean(actor && row.owner_id === actor.id);
  const hasLink = row.visibility === "unlisted" && ["validated", "pending_review", "published"].includes(row.status) && sameHash(accessKey, row.unlisted_access_hash);
  return { isOwner, hasLink, allowed: isOwner || hasLink || (row.visibility === "public" && row.status === "published") };
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
  async getEditorialRecord(problemId: string): Promise<EditorialRecord | null> {
    const { data, error } = await this.client().rpc("read_private_editorial_record", { p_problem_id: problemId });
    if (error) fail("A edição requer as migrações editorial e 202609090009_private_artifacts.sql", error);
    return data as EditorialRecord ?? null;
  }

  async saveEditorialRecord(record: EditorialRecord, expectedRevision: number): Promise<boolean> {
    const { data, error } = await this.client().rpc("save_editorial_record", { p_problem_id: record.problemId, p_expected_revision: expectedRevision, p_record: record });
    if (error) fail("Não foi possível salvar o rascunho editorial", error);
    return data === true;
  }

  async commitEditorialVersion(record: EditorialRecord, expectedRevision: number, actor: Actor): Promise<void> {
    const { error } = await this.client().rpc("commit_editorial_version", { p_problem_id: record.problemId, p_expected_revision: expectedRevision, p_record: record, p_actor_id: actor.id, p_fingerprint: problemFingerprint(record.package.problem), p_checksum: hash(JSON.stringify(record.package.bundle)) });
    if (error) fail("Não foi possível concluir a versão editorial", error);
  }

  async listEditorialReviews(problemId: string): Promise<EditorialReview[]> {
    const { data, error } = await this.client().from("publication_reviews").select("*").eq("problem_id", problemId).order("created_at", { ascending: false });
    if (error) fail("Não foi possível ler as revisões", error);
    return (data ?? []).map(reviewFromRow);
  }

  async getPackageVersion(problemId: string, version: number, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    if (!Number.isSafeInteger(version) || version < 1) return null;
    const seed = seedProblems.find((problem) => problem.id === problemId && problem.version === version);
    if (seed) return this.getPackageById(problemId, actor, accessKey);
    const row = await this.readRow(problemId);
    if (!row) return null;
    const problem = await this.readDefinition(problemId, version);
    if (!problem) return null;
    const owns = actor?.role === "admin" || (actor && row.owner_id === actor.id);
    const publicVersion = row.status === "published" && row.visibility === "public" && problem.status === "published";
    const unlisted = row.visibility === "unlisted" && sameHash(accessKey, row.unlisted_access_hash) && ["validated", "pending_review", "published"].includes(problem.status);
    if (!owns && !publicVersion && !unlisted) return null;
    return this.readPackage(problem);
  }
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
    return [...byId.values()].map(withMetadata);
  }

  async listDiscoveryProblems(actor: Actor): Promise<ProblemDefinition[]> {
    const byId = new Map((await this.listCatalog()).map((problem) => [problem.id, problem]));
    // Discovery is personal even for administrators. Editorial access is a separate capability.
    const { data, error } = await this.client().from("problems").select("id,latest_version").eq("owner_id", actor.id);
    if (error) fail("Não foi possível ler suas questões para recomendações", error);
    const definitions = await Promise.all((data ?? []).map((row) => this.readDefinition(row.id, row.latest_version)));
    for (const problem of definitions) {
      if (problem && problemOwnerId(problem) === actor.id && ["validated", "pending_review", "published"].includes(problem.status)) {
        byId.set(problem.id, problem);
      }
    }
    return [...byId.values()];
  }

  async listExternalCandidates(actor: Actor): Promise<SearchCandidate[]> {
    const { data, error } = await this.client().from("external_problem_candidates")
      .select("candidate").eq("user_id", actor.id).order("updated_at", { ascending: false });
    if (error) failDiscovery("Não foi possível ler os metadados dos links externos", error);
    return (data ?? []).flatMap((row) => {
      const candidate = persistableExternalCandidate(row.candidate as SearchCandidate);
      return candidate ? [candidate] : [];
    });
  }

  async saveExternalCandidates(actor: Actor, candidates: SearchCandidate[]): Promise<void> {
    const byKey = new Map<string, SearchCandidate>();
    for (const candidate of candidates) {
      const safe = persistableExternalCandidate(candidate);
      if (safe) byKey.set(JSON.stringify([safe.url, safe.runtime]), safe);
    }
    if (!byKey.size) return;
    const { error } = await this.client().from("external_problem_candidates").upsert([...byKey.values()].map((candidate) => ({
      user_id: actor.id,
      canonical_url: candidate.url,
      runtime: candidate.runtime,
      candidate,
      updated_at: new Date().toISOString()
    })), { onConflict: "user_id,canonical_url,runtime" });
    if (error) failDiscovery("Não foi possível guardar os metadados dos links externos", error);
  }

  async saveJob(job: AuthoringJob): Promise<void> {
    const { error } = await this.client().from("ai_jobs").upsert({
      id: job.id,
      user_id: job.actorId,
      mode: job.request.mode,
      status: job.status,
      request: job.request,
      progress: job.progress ?? null,
      result: publicJob(job),
      error: job.error ?? null,
      created_at: job.createdAt,
      completed_at: job.completedAt ?? null
    });
    if (error) failDiscovery("Não foi possível salvar o trabalho de IA", error);
  }

  async getJob(jobId: string): Promise<AuthoringJob | null> {
    const { data, error } = await this.client().from("ai_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) fail("Não foi possível ler o trabalho de IA", error);
    if (!data) return null;
    return jobFromRow(data);
  }

  async claimConfirmation(jobId: string, actorId: string): Promise<AuthoringJob | null> {
    const { data, error } = await this.client().from("ai_jobs").update({ status: "running" })
      .eq("id", jobId).eq("user_id", actorId).eq("status", "needs_confirmation").select("*").maybeSingle();
    if (error) failDiscovery("Não foi possível confirmar a criação da questão", error);
    // UPDATE ... WHERE status ... RETURNING is a single compare-and-set operation.
    return data ? { ...jobFromRow(data), status: "needs_confirmation" } : null;
  }

  async savePackage(value: GeneratedPackage): Promise<void> {
    const client = this.client();
    const problem = value.problem = withMetadata(value.problem);
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
    const bundle = await client.rpc("insert_private_judge_bundle", {
      p_problem_id: problem.id,
      p_problem_version: problem.version,
      p_bundle: value.bundle,
      p_validation: value.validation,
      p_checksum: hash(JSON.stringify(value.bundle))
    });
    if (bundle.error) {
      await client.from("problems").delete().eq("id", problem.id);
      fail("Não foi possível guardar o bundle privado; verifique a migração 202609090009", bundle.error);
    }
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
    if (JSON.stringify(value.problem.provenance) !== JSON.stringify(latest.provenance) || value.problem.origin !== latest.origin) throw new Error("A autoria, a origem e a licença não podem ser alteradas.");

    const revision = { ...value, problem: { ...value.problem, metadata: buildProblemMetadata(value.problem), status: "validated" as const } };
    const version = await client.from("problem_versions").insert({
      problem_id: row.id,
      version: revision.problem.version,
      definition: revision.problem,
      created_by: actor.id
    });
    if (version.error) fail("Não foi possível salvar a nova versão", version.error);
    const bundle = await client.rpc("insert_private_judge_bundle", {
      p_problem_id: row.id,
      p_problem_version: revision.problem.version,
      p_bundle: revision.bundle,
      p_validation: revision.validation,
      p_checksum: hash(JSON.stringify(revision.bundle))
    });
    if (bundle.error) {
      await client.from("problem_versions").delete().eq("problem_id", row.id).eq("version", revision.problem.version);
      fail("Não foi possível guardar o bundle da nova versão", bundle.error);
    }
    const update = await client.from("problems").update({ latest_version: revision.problem.version, updated_at: revision.problem.updatedAt }).eq("id", row.id);
    if (update.error) fail("Não foi possível ativar a nova versão de trabalho", update.error);
    return revision;
  }

  async requestPublication(problemId: string, actor: Actor, expectedVersion?: number): Promise<void> {
    const { error } = await this.client().rpc("request_editorial_publication", { p_problem_id: problemId, p_actor_id: actor.id, p_expected_version: expectedVersion ?? null });
    if (error) fail("Não foi possível solicitar publicação", error);
  }

  async getPackageById(problemId: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.id === problemId);
    if (seed) {
      const persisted = await this.readPrivateBundle(seed.id, seed.version);
      return { problem: withMetadata(seed), bundle: persisted ?? { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: emptyValidation };
    }
    const row = await this.readRow(problemId);
    if (!row) return null;
    const { isOwner, hasLink, allowed } = currentProblemAccess(row, actor, accessKey);
    if (!allowed) return null;
    const problem = await this.readDefinition(row.id, isOwner || hasLink ? row.latest_version : row.current_version);
    if (!problem || !canReadProblem(problem, actor, hasLink)) return null;
    return this.readPackage(problem);
  }

  async getPackageBySlug(slug: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null> {
    const seed = seedProblems.find((problem) => problem.slug === slug);
    if (seed) {
      const persisted = await this.readPrivateBundle(seed.id, seed.version);
      return { problem: withMetadata(seed), bundle: persisted ?? { schemaVersion: 1, problemId: seed.id, problemVersion: seed.version, visibleCases: [], hiddenCases: [], referenceSolutions: {} }, validation: emptyValidation };
    }
    const { data, error } = await this.client().from("problems").select("id,slug,owner_id,visibility,status,current_version,latest_version,unlisted_access_hash").eq("slug", slug).maybeSingle();
    if (error) fail("Não foi possível ler a questão", error);
    if (!data) return null;
    const row = data as ProblemRow;
    const { isOwner, hasLink, allowed } = currentProblemAccess(row, actor, accessKey);
    if (!allowed) return null;
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
    const { data, error } = await this.client().from("publication_reviews").select("*").eq("status", "pending");
    if (error) fail("Não foi possível listar revisões", error);
    return Promise.all((data ?? []).map(async (row) => {
      const problem = await this.readDefinition(row.problem_id, row.problem_version);
      if (!problem) throw new Error("Versão ausente.");
      return { ...await this.readPackage(problem), editorialReview: reviewFromRow(row) };
    }));
  }

  async moderate(problemId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    const review = (await this.listEditorialReviews(problemId)).find((item) => item.status === "pending");
    if (!review) throw new Error("Revisão pendente não encontrada.");
    return this.moderateReview(review.id, decision, actor, reason);
  }

  async moderateReview(reviewId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage> {
    if (actor.role !== "admin") throw new Error("Somente administradores podem revisar questões.");
    const { data: review, error: reviewError } = await this.client().from("publication_reviews").select("problem_id,problem_version").eq("id", reviewId).maybeSingle();
    if (reviewError || !review) fail("Revisão não encontrada", reviewError);
    const definition = await this.readDefinition(review.problem_id, review.problem_version);
    if (!definition) throw new Error("Versão revisada não encontrada.");
    const { data, error } = await this.client().rpc("moderate_editorial_review", { p_review_id: reviewId, p_actor_id: actor.id, p_decision: decision, p_reason: reason?.trim() ?? null, p_fingerprint: problemFingerprint(definition) });
    if (error) fail("Não foi possível concluir a revisão editorial", error);
    const problem = await this.readDefinition(data.problemId, data.problemVersion);
    if (!problem) throw new Error("Versão revisada não encontrada.");
    return this.readPackage(problem);
  }

  private async readRow(problemId: string): Promise<ProblemRow | null> {
    const { data, error } = await this.client().from("problems").select("id,slug,owner_id,visibility,status,current_version,latest_version,unlisted_access_hash").eq("id", problemId).maybeSingle();
    if (error) fail("Não foi possível ler a questão", error);
    return data as ProblemRow | null;
  }

  private async readDefinition(problemId: string, version: number): Promise<ProblemDefinition | null> {
    const { data, error } = await this.client().from("problem_versions").select("definition").eq("problem_id", problemId).eq("version", version).maybeSingle();
    if (error) fail("Não foi possível ler a versão da questão", error);
    return data?.definition ? withMetadata(data.definition as ProblemDefinition) : null;
  }

  private async readPackage(problem: ProblemDefinition): Promise<GeneratedPackage> {
    const { data, error } = await this.client().rpc("read_private_judge_bundle", { p_problem_id: problem.id, p_problem_version: problem.version });
    if (error) fail("Não foi possível ler o pacote editorial; verifique a migração 202609090009", error);
    if (!data?.bundle) throw new Error("Bundle do judge ausente.");
    return { problem, bundle: data.bundle, validation: data.validation ?? emptyValidation } as GeneratedPackage;
  }

  private async readPrivateBundle(problemId: string, version: number): Promise<GeneratedPackage["bundle"] | null> {
    const { data, error } = await this.client().rpc("read_private_judge_bundle", { p_problem_id: problemId, p_problem_version: version });
    if (error) fail("Não foi possível ler o bundle do judge; verifique a migração 202609090009", error);
    return (data?.bundle ?? null) as GeneratedPackage["bundle"] | null;
  }
}
