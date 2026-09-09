import type { Runtime } from "@silogium/core";
import type { LicensedExerciseSource, LicensedSourceAdapter, SearchCandidate } from "./types.js";

type ExercismConfig = {
  exercises?: { practice?: Array<{ slug: string; name: string; difficulty?: number; practices?: string[] }> };
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

async function confirmsMitLicense(track: string): Promise<boolean> {
  try {
    const response = await fetch(`https://raw.githubusercontent.com/exercism/${track}/main/LICENSE`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return false;
    const license = await response.text();
    return /MIT License/i.test(license) && /permission is hereby granted/i.test(license);
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
      const terms = normalize(prompt).split(/\s+/).filter((term) => term.length > 2);
      return (config.exercises?.practice ?? [])
        .map((exercise) => {
          const text = normalize(`${exercise.name} ${exercise.slug} ${(exercise.practices ?? []).join(" ")}`);
          const score = terms.filter((term) => text.includes(term)).length;
          return { exercise, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.exercise.name.localeCompare(right.exercise.name))
        .slice(0, 3)
        .map(({ exercise }) => ({
          id: `exercism-${track}-${exercise.slug}`,
          kind: "licensed_import" as const,
          title: exercise.name,
          summary: `Exercício do track ${track}; pratica ${(exercise.practices ?? []).join(", ") || "fundamentos"}.`,
          url: `https://github.com/exercism/${track}/tree/main/exercises/practice/${exercise.slug}`,
          sourceName: "Exercism",
          licenseSpdx: "MIT",
          runtime,
          importable: true
        }));
    } catch {
      return [];
    }
  }

  async load(slug: string, runtime: Runtime): Promise<LicensedExerciseSource> {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Slug do Exercism inválido.");
    const track = runtime === "typescript" ? "typescript" : "python";
    if (!await confirmsMitLicense(track)) throw new Error("A licença MIT do track do Exercism não pôde ser confirmada.");
    const base = `https://raw.githubusercontent.com/exercism/${track}/main/exercises/practice/${slug}`;
    const [instructionsResponse, metadataResponse, commitResponse] = await Promise.all([
      fetch(`${base}/.docs/instructions.md`, { signal: AbortSignal.timeout(8_000) }),
      fetch(`${base}/.meta/config.json`, { signal: AbortSignal.timeout(8_000) }),
      fetch(`https://api.github.com/repos/exercism/${track}/commits?path=exercises/practice/${slug}&per_page=1`, { headers: { accept: "application/vnd.github+json", "user-agent": "silogium" }, signal: AbortSignal.timeout(8_000) })
    ]);
    if (!instructionsResponse.ok || !metadataResponse.ok) throw new Error("O exercício não possui todos os metadados necessários para importação.");
    const metadata = await metadataResponse.json() as { authors?: string[]; contributors?: string[]; files?: { solution?: string[]; test?: string[] } };
    const fallbackFile = runtime === "typescript" ? `${slug}.ts` : `${slug.replaceAll("-", "_")}.py`;
    const fallbackTest = runtime === "typescript" ? `${slug}.test.ts` : `${slug.replaceAll("-", "_")}_test.py`;
    const file = metadata.files?.solution?.[0] ?? fallbackFile;
    const tests = metadata.files?.test?.[0] ?? fallbackTest;
    const [starterResponse, testsResponse] = await Promise.all([
      fetch(`${base}/${file}`, { signal: AbortSignal.timeout(8_000) }),
      fetch(`${base}/${tests}`, { signal: AbortSignal.timeout(8_000) })
    ]);
    if (!starterResponse.ok || !testsResponse.ok) throw new Error("O exercício não possui todos os arquivos necessários para importação.");
    const commits = commitResponse.ok ? await commitResponse.json() as Array<{ sha?: string }> : [];
    const title = slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
    return {
      sourceName: "Exercism",
      sourceUrl: `https://github.com/exercism/${track}/tree/main/exercises/practice/${slug}`,
      repositoryUrl: `https://github.com/exercism/${track}`,
      licenseUrl: `https://github.com/exercism/${track}/blob/main/LICENSE`,
      licenseSpdx: "MIT",
      title,
      slug,
      runtime,
      instructions: (await instructionsResponse.text()).slice(0, 30_000),
      starterCode: (await starterResponse.text()).slice(0, 20_000),
      sourceTests: (await testsResponse.text()).slice(0, 40_000),
      authors: [...new Set(metadata.authors ?? [])],
      contributors: [...new Set(metadata.contributors ?? [])],
      commitSha: commits[0]?.sha,
      retrievedAt: new Date().toISOString()
    };
  }
}
