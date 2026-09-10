import { buildCandidateMetadata, rankSimilarCandidates, type Runtime } from "@silogium/core";
import type { LicensedExerciseSource, LicensedSourceAdapter, SearchCandidate } from "./types.js";
import { captureExercismSource, confirmsMitLicenseText } from "./source-snapshot.js";

type ExercismConfig = {
  exercises?: { practice?: Array<{ slug: string; name: string; difficulty?: number; practices?: string[] }> };
};

async function confirmsMitLicense(track: string): Promise<boolean> {
  try {
    const response = await fetch(`https://raw.githubusercontent.com/exercism/${track}/main/LICENSE`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return false;
    const license = await response.text();
    return confirmsMitLicenseText(license);
  } catch {
    return false;
  }
}

export class ExercismAdapter implements LicensedSourceAdapter {
  async search(prompt: string, runtime: Runtime): Promise<SearchCandidate[]> {
    const track = runtime === "typescript" ? "typescript" : "python";
    try {
      const [response, licensed] = await Promise.all([
        fetch(`https://raw.githubusercontent.com/exercism/${track}/main/config.json`, { signal: AbortSignal.timeout(5_000) }),
        confirmsMitLicense(track)
      ]);
      if (!response.ok || !licensed) return [];
      const config = await response.json() as ExercismConfig;
      const retrievedAt = new Date().toISOString();
      const candidates: SearchCandidate[] = (config.exercises?.practice ?? [])
        .filter((exercise) => exercise && typeof exercise.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exercise.slug) && typeof exercise.name === "string" && exercise.name.trim().length > 0)
        .map((exercise) => {
          const practices = Array.isArray(exercise.practices) ? exercise.practices.filter((practice): practice is string => typeof practice === "string").slice(0, 24).map((practice) => practice.slice(0, 64)) : [];
          const candidate: SearchCandidate = {
            id: `exercism-${track}-${exercise.slug}`,
            kind: "licensed_import",
            title: exercise.name.trim().slice(0, 200),
            summary: `Exercício do track ${track}; pratica ${practices.join(", ") || "fundamentos"}.`,
            url: `https://github.com/exercism/${track}/tree/main/exercises/practice/${exercise.slug}`,
            sourceName: "Exercism",
            licenseSpdx: "MIT",
            runtime,
            importable: true,
            format: "classic",
            retrievedAt
          };
          // Metadata describes the source exercise, never the user's search request.
          return { ...candidate, metadata: buildCandidateMetadata(candidate) };
        });
      return rankSimilarCandidates({ prompt, runtime }, candidates).slice(0, 3);
    } catch {
      return [];
    }
  }

  async load(slug: string, runtime: Runtime): Promise<LicensedExerciseSource> {
    return captureExercismSource(slug, runtime);
  }
}
