import { z } from "zod";

export const RuntimeSchema = z.enum(["typescript", "python"]);
export type Runtime = z.infer<typeof RuntimeSchema>;
export const ProblemFormatSchema = z.enum(["classic", "progressive"]);
export type ProblemFormat = z.infer<typeof ProblemFormatSchema>;
const DiscoveryTermSchema = z.string().trim().min(1).max(64);
/** Search hints inferred from public descriptions, never a license or authorship authority. */
export const DiscoveryMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  concepts: z.array(DiscoveryTermSchema).max(24),
  skills: z.array(DiscoveryTermSchema).max(24),
  topics: z.array(DiscoveryTermSchema).max(16),
  keywords: z.array(DiscoveryTermSchema).max(32),
  runtimes: z.array(RuntimeSchema).max(2),
  format: z.enum(["classic", "progressive", "unknown"]),
  difficulty: z.enum(["easy", "medium", "hard", "unknown"]),
  inferred: z.literal(true)
});
export type DiscoveryMetadata = z.infer<typeof DiscoveryMetadataSchema>;
export const ProblemOriginSchema = z.enum(["native", "licensed_import"]);
export const ProblemVisibilitySchema = z.enum(["private", "unlisted", "public"]);
export const ProblemStatusSchema = z.enum([
  "draft", "validating", "validated", "pending_review", "published", "rejected"
]);

export const ProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("native"),
    createdBy: z.string().min(1),
    createdByHandle: z.string().min(1).optional(),
    assistedByAi: z.boolean(),
    statementLicense: z.literal("CC-BY-4.0"),
    codeLicense: z.literal("MIT")
  }),
  z.object({
    kind: z.literal("licensed_import"),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
    repositoryUrl: z.string().url().optional(),
    licenseUrl: z.string().url().optional(),
    licenseSpdx: z.string().min(1),
    authors: z.array(z.string()),
    contributors: z.array(z.string()).default([]),
    importedBy: z.string().min(1).optional(),
    importedByHandle: z.string().min(1).optional(),
    commitSha: z.string().optional(),
    sourceSnapshot: z.object({
      schemaVersion: z.literal(1),
      commitSha: z.string().regex(/^[0-9a-f]{40}$/),
      totalBytes: z.number().int().nonnegative().max(524_288),
      files: z.array(z.object({
        path: z.string().min(1).max(300),
        roles: z.array(z.enum(["metadata", "instructions", "solution", "test", "support", "example", "license", "notice"])).min(1),
        url: z.string().url(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        bytes: z.number().int().nonnegative().max(131_072)
      })).min(1).max(40)
    }).optional(),
    legalNotices: z.array(z.object({ path: z.string().min(1).max(300), url: z.string().url(), text: z.string().max(131_072) })).max(40).optional(),
    retrievedAt: z.string().datetime()
  })
]);

export const RuntimeDefinitionSchema = z.object({
  language: RuntimeSchema,
  version: z.string().min(1),
  starterCode: z.string(),
  entrypoint: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("class"),
      symbol: z.string().min(1),
      methodMap: z.record(z.string(), z.string()).default({})
    }),
    z.object({ kind: z.literal("stdio") })
  ])
});

export const ProblemDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  version: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  summary: z.string().min(10),
  locale: z.literal("pt-BR"),
  origin: ProblemOriginSchema,
  visibility: ProblemVisibilitySchema,
  status: ProblemStatusSchema,
  format: ProblemFormatSchema,
  executionModel: z.enum(["stdio", "call-sequence"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string().min(1)).min(1),
  metadata: DiscoveryMetadataSchema.optional(),
  stages: z.array(z.object({
    number: z.number().int().positive(),
    statementMd: z.string().min(1),
    points: z.number().int().nonnegative()
  })).min(1).max(4),
  runtimes: z.array(RuntimeDefinitionSchema).min(1),
  examples: z.array(z.record(z.string(), z.unknown())).default([]),
  limits: z.object({
    timeMs: z.number().int().positive().max(30_000),
    memoryMiB: z.number().int().positive().max(1024),
    outputBytes: z.number().int().positive().max(1_048_576)
  }),
  provenance: ProvenanceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((problem, context) => {
  if (problem.format === "classic" && problem.stages.length !== 1) {
    context.addIssue({ code: "custom", path: ["stages"], message: "Questões clássicas devem ter um estágio." });
  }
  if (problem.format === "progressive" && problem.stages.length < 2) {
    context.addIssue({ code: "custom", path: ["stages"], message: "Questões progressivas devem ter pelo menos dois estágios." });
  }
  if (new Set(problem.stages.map((stage) => stage.number)).size !== problem.stages.length) {
    context.addIssue({ code: "custom", path: ["stages"], message: "Números de estágio duplicados." });
  }
  if (new Set(problem.runtimes.map((runtime) => runtime.language)).size !== problem.runtimes.length) {
    context.addIssue({ code: "custom", path: ["runtimes"], message: "Linguagens duplicadas." });
  }
});

export type ProblemDefinition = z.infer<typeof ProblemDefinitionSchema>;
export type RuntimeDefinition = z.infer<typeof RuntimeDefinitionSchema>;

const CallSchema = z.object({ method: z.string().min(1), args: z.array(z.unknown()), expected: z.unknown() });
const CallSequenceCaseSchema = z.object({
  kind: z.literal("call-sequence"),
  id: z.string().min(1),
  name: z.string().min(1),
  stage: z.number().int().positive(),
  constructorArgs: z.array(z.unknown()).default([]),
  calls: z.array(CallSchema).min(1)
});
const StdioCaseSchema = z.object({
  kind: z.literal("stdio"),
  id: z.string().min(1),
  name: z.string().min(1),
  stage: z.number().int().positive(),
  stdin: z.string(),
  expectedStdout: z.string()
});
export const JudgeCaseSchema = z.discriminatedUnion("kind", [CallSequenceCaseSchema, StdioCaseSchema]);
export type JudgeCase = z.infer<typeof JudgeCaseSchema>;

export const JudgeBundleSchema = z.object({
  schemaVersion: z.literal(1),
  problemId: z.string().uuid(),
  problemVersion: z.number().int().positive(),
  visibleCases: z.array(JudgeCaseSchema),
  hiddenCases: z.array(JudgeCaseSchema),
  referenceSolutions: z.partialRecord(RuntimeSchema, z.string())
});
export type JudgeBundle = z.infer<typeof JudgeBundleSchema>;

export const ContentRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("search"), prompt: z.string().min(5).max(2_000), runtime: RuntimeSchema.default("typescript") }),
  z.object({
    mode: z.literal("create"),
    prompt: z.string().min(5).max(2_000),
    runtime: RuntimeSchema.default("typescript"),
    format: ProblemFormatSchema.default("classic"),
    difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    visibility: z.enum(["private", "unlisted", "public"]).default("private")
  })
]);
export type ContentRequest = z.infer<typeof ContentRequestSchema>;

export const ExecutionRequestSchema = z.object({
  kind: z.enum(["run", "submission"]),
  problemId: z.string().uuid(),
  problemVersion: z.number().int().positive(),
  runtime: RuntimeSchema,
  source: z.string().min(1).max(200_000),
  maxStage: z.number().int().positive().max(4).optional()
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const VerdictSchema = z.enum([
  "accepted", "wrong_answer", "compile_error", "runtime_error", "time_limit",
  "memory_limit", "output_limit", "system_error"
]);
export type Verdict = z.infer<typeof VerdictSchema>;
export const ExecutionResultSchema = z.object({
  id: z.string(),
  verdict: VerdictSchema,
  score: z.number().int().nonnegative(),
  maxScore: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  cases: z.array(z.object({
    id: z.string(), name: z.string(), stage: z.number().int(), passed: z.boolean(), message: z.string().optional(),
    mismatch: z.object({
      expected: z.json(),
      actual: z.json(),
      method: z.string().optional(),
      input: z.json().optional()
    }).optional()
  })),
  message: z.string().optional()
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type Actor = { id: string; handle: string; role: "user" | "admin" };

export function problemOwnerId(problem: ProblemDefinition): string | undefined {
  return problem.provenance.kind === "native" ? problem.provenance.createdBy : problem.provenance.importedBy;
}
