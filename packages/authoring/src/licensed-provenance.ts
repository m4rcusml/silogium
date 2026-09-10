import { ProvenanceSchema, type Actor, type ProblemDefinition } from "@silogium/core";
import type { LicensedExerciseSource } from "./types.js";

/** Provenance comes from the verified connector, never from generated model output.
 * Source solutions/tests remain conversion input; only hashes and legal notices persist publicly. */
export function licensedProvenance(source: LicensedExerciseSource, actor: Actor): ProblemDefinition["provenance"] {
  return ProvenanceSchema.parse({
    kind: "licensed_import",
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    repositoryUrl: source.repositoryUrl,
    licenseUrl: source.licenseUrl,
    licenseSpdx: source.licenseSpdx,
    authors: [...source.authors],
    contributors: [...source.contributors],
    importedBy: actor.id,
    importedByHandle: actor.handle,
    commitSha: source.commitSha,
    retrievedAt: source.retrievedAt,
    sourceSnapshot: {
      schemaVersion: 1,
      commitSha: source.commitSha,
      totalBytes: source.snapshot.totalBytes,
      files: source.snapshot.files.map(({ path, roles, url, sha256, bytes }) => ({ path, roles, url, sha256, bytes }))
    },
    legalNotices: source.snapshot.files.filter((file) => file.roles.includes("license") || file.roles.includes("notice"))
      .map(({ path, url, content }) => ({ path, url, text: content }))
  });
}
