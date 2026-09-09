import type { Actor, ContentRequest, JudgeBundle, ProblemDefinition, Runtime } from "@silogium/core";

export type SearchCandidate = {
  id: string;
  kind: "catalog" | "licensed_import" | "external_link";
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  licenseSpdx?: string;
  runtime: Runtime;
  importable: boolean;
};

export type LicensedExerciseSource = {
  sourceName: string;
  sourceUrl: string;
  repositoryUrl: string;
  licenseUrl: string;
  licenseSpdx: string;
  title: string;
  slug: string;
  runtime: Runtime;
  instructions: string;
  starterCode: string;
  sourceTests: string;
  authors: string[];
  contributors: string[];
  commitSha?: string;
  retrievedAt: string;
};

export type ValidationReport = {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; message?: string }>;
};

export type GeneratedPackage = {
  problem: ProblemDefinition;
  bundle: JudgeBundle;
  validation: ValidationReport;
  /** Segredo exibido uma única vez ao autor para compartilhar uma questão não listada. */
  accessKey?: string;
};

export type AuthoringJob = {
  id: string;
  actorId: string;
  status: "running" | "completed" | "failed" | "needs_clarification";
  request: ContentRequest;
  createdAt: string;
  completedAt?: string;
  result?: { kind: "search"; candidates: SearchCandidate[] } | { kind: "create"; package: GeneratedPackage };
  error?: string;
};

export interface ProblemAuthoring {
  request(input: ContentRequest, actor: Actor): Promise<{ jobId: string }>;
  getJob(jobId: string, actor: Actor): Promise<AuthoringJob | null>;
  requestPublication(problemId: string, actor: Actor): Promise<void>;
  importLicensed(sourceName: string, slug: string, runtime: Runtime, actor: Actor): Promise<GeneratedPackage>;
  revise(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage>;
}

export interface AiAuthoringAdapter {
  create(input: Extract<ContentRequest, { mode: "create" }>, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }>;
  searchWeb(prompt: string, runtime: Runtime, actor: Actor): Promise<SearchCandidate[]>;
  importLicensed(source: LicensedExerciseSource, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }>;
}

export interface LicensedSourceAdapter {
  search(prompt: string, runtime: Runtime): Promise<SearchCandidate[]>;
  load?(slug: string, runtime: Runtime): Promise<LicensedExerciseSource>;
}

export interface AuthoringRepository {
  listCatalog(): Promise<ProblemDefinition[]>;
  saveJob(job: AuthoringJob): Promise<void>;
  getJob(jobId: string): Promise<AuthoringJob | null>;
  savePackage(value: GeneratedPackage): Promise<void>;
  saveRevision(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage>;
  requestPublication(problemId: string, actor: Actor): Promise<void>;
  getPackageById(problemId: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null>;
  getPackageBySlug(slug: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null>;
  listForActor(actor: Actor): Promise<GeneratedPackage[]>;
  listPending(actor: Actor): Promise<GeneratedPackage[]>;
  moderate(problemId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage>;
}

export interface ProblemValidator {
  validate(problem: ProblemDefinition, bundle: JudgeBundle): Promise<ValidationReport>;
}
