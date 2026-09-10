import type { Actor, ContentRequest, DiscoveryMetadata, JudgeBundle, ProblemDefinition, Runtime } from "@silogium/core";
import type { AuthoringRequest, ConversationContext } from "./conversation.js";

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
  metadata?: DiscoveryMetadata;
  matchReasons?: string[];
  similarity?: number;
  retrievedAt?: string;
  difficulty?: ProblemDefinition["difficulty"];
  format?: ProblemDefinition["format"];
};

/** Bounded, readable context. Never includes statements, code or judge fixtures. */
export type DiscoveryContext = { candidates: Array<Pick<SearchCandidate, "title" | "url" | "kind" | "sourceName" | "metadata">> };

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
  commitSha: string;
  licenseText: string;
  /** Private conversion input. Public provenance carries a content-free manifest, not source solutions. */
  snapshot: {
    schemaVersion: 1;
    totalBytes: number;
    files: Array<{
      path: string;
      roles: Array<"metadata" | "instructions" | "solution" | "test" | "support" | "example" | "license" | "notice">;
      url: string;
      sha256: string;
      bytes: number;
      content: string;
    }>;
  };
  retrievedAt: string;
};

export type ValidationReport = {
  valid: boolean;
  /** Retryable infrastructure failure, not evidence that the generated problem is defective. */
  infrastructureError?: boolean;
  checks: Array<{ name: string; passed: boolean; message?: string }>;
  warnings?: string[];
  coverage?: import("./quality.js").QualityCoverage;
};

export type GeneratedPackage = {
  problem: ProblemDefinition;
  bundle: JudgeBundle;
  validation: ValidationReport;
  /** Segredo exibido uma única vez ao autor para compartilhar uma questão não listada. */
  accessKey?: string;
  editorialReview?: import("./editorial-types.js").EditorialReview;
};

export type AuthoringJob = {
  progress?: { phase: import("./ai-work.js").AiPhase; updatedAt: string; retryAt?: string };
  id: string;
  actorId: string;
  status: "running" | "completed" | "failed" | "needs_clarification" | "needs_confirmation";
  request: AuthoringRequest;
  createdAt: string;
  completedAt?: string;
  result?: { kind: "search"; candidates: SearchCandidate[] } | { kind: "create"; package: GeneratedPackage } | { kind: "recommendations"; candidates: SearchCandidate[] }
    | { kind: "refine"; slug: string; title: string; revision: number; validation: ValidationReport };
  error?: string;
};

export interface ProblemAuthoring {
  request(input: AuthoringRequest, actor: Actor): Promise<{ jobId: string; conversationId?: string }>;
  getJob(jobId: string, actor: Actor): Promise<AuthoringJob | null>;
  confirmCreation(jobId: string, actor: Actor): Promise<{ jobId: string }>;
  requestPublication(problemId: string, actor: Actor): Promise<void>;
  importLicensed(sourceName: string, slug: string, runtime: Runtime, actor: Actor): Promise<GeneratedPackage>;
  revise(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage>;
}

export interface AiAuthoringAdapter {
  readonly searchAvailable?: boolean;
  create(input: Extract<ContentRequest, { mode: "create" }>, actor: Actor, context?: DiscoveryContext, conversation?: ConversationContext): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }>;
  refine?(input: { prompt: string; problem: ProblemDefinition; bundle: JudgeBundle }, actor: Actor, conversation?: ConversationContext): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }>;
  repair?(
    input: Extract<ContentRequest, { mode: "create" }>,
    actor: Actor,
    previous: { problem: ProblemDefinition; bundle: JudgeBundle },
    validation: ValidationReport
  ): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }>;
  searchWeb(prompt: string, runtime: Runtime, actor: Actor, context?: DiscoveryContext, conversation?: ConversationContext): Promise<SearchCandidate[]>;
  importLicensed(source: LicensedExerciseSource, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }>;
}

export interface LicensedSourceAdapter {
  search(prompt: string, runtime: Runtime): Promise<SearchCandidate[]>;
  load?(slug: string, runtime: Runtime): Promise<LicensedExerciseSource>;
}

export interface AuthoringRepository {
  getEditorialRecord(problemId: string): Promise<import("./editorial-types.js").EditorialRecord | null>;
  saveEditorialRecord(record: import("./editorial-types.js").EditorialRecord, expectedRevision: number): Promise<boolean>;
  commitEditorialVersion(record: import("./editorial-types.js").EditorialRecord, expectedRevision: number, actor: Actor): Promise<void>;
  listEditorialReviews(problemId: string): Promise<import("./editorial-types.js").EditorialReview[]>;
  moderateReview(reviewId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage>;
  getPackageVersion(problemId: string, version: number, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null>;
  listCatalog(): Promise<ProblemDefinition[]>;
  listDiscoveryProblems(actor: Actor): Promise<ProblemDefinition[]>;
  listExternalCandidates(actor: Actor): Promise<SearchCandidate[]>;
  saveExternalCandidates(actor: Actor, candidates: SearchCandidate[]): Promise<void>;
  /** Atomically consumes a pending confirmation; only its owner may claim it. */
  claimConfirmation(jobId: string, actorId: string): Promise<AuthoringJob | null>;
  saveJob(job: AuthoringJob): Promise<void>;
  getJob(jobId: string): Promise<AuthoringJob | null>;
  savePackage(value: GeneratedPackage): Promise<void>;
  saveRevision(value: GeneratedPackage, actor: Actor): Promise<GeneratedPackage>;
  requestPublication(problemId: string, actor: Actor, expectedVersion?: number): Promise<void>;
  getPackageById(problemId: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null>;
  getPackageBySlug(slug: string, actor?: Actor, accessKey?: string): Promise<GeneratedPackage | null>;
  listForActor(actor: Actor): Promise<GeneratedPackage[]>;
  listPending(actor: Actor): Promise<GeneratedPackage[]>;
  moderate(problemId: string, decision: "approve" | "reject", actor: Actor, reason?: string): Promise<GeneratedPackage>;
}

export interface ProblemValidator {
  validate(problem: ProblemDefinition, bundle: JudgeBundle): Promise<ValidationReport>;
}
