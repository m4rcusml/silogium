import type { JudgeBundle, JudgeCase, ProblemDefinition } from "@silogium/core";
import type { GeneratedPackage, ValidationReport } from "./types.js";

export type EditorialReview = {
  id: string; problemId: string; problemVersion: number; requestedBy: string;
  status: "pending" | "approved" | "rejected"; createdAt: string;
  reviewerId?: string; reason?: string; reviewedAt?: string;
};

/** Private persistence. Never serialize this record to a normal client. */
export type EditorialRecord = {
  problemId: string; revision: number; baseVersion: number;
  phase: "draft" | "validating" | "validated";
  package: GeneratedPackage; updatedAt: string; spoilersViewedBy: string[];
};

export type EditableProblem = Pick<ProblemDefinition, "title" | "summary" | "difficulty" | "tags" | "stages" | "runtimes" | "examples" | "limits">;
export type EditorialView = {
  revision: number; baseVersion: number; phase: EditorialRecord["phase"];
  problem: ProblemDefinition; visibleCases: JudgeCase[]; validation: ValidationReport;
  reviews: EditorialReview[]; spoilersRevealed: boolean;
  spoilers?: Pick<JudgeBundle, "hiddenCases" | "referenceSolutions">;
};
export type SaveEditorialDraft = {
  expectedRevision: number; content: EditableProblem; visibleCases: JudgeCase[];
  spoilers?: Pick<JudgeBundle, "hiddenCases" | "referenceSolutions">;
};
