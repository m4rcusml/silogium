import type { ProblemDefinition, Runtime } from "./schemas.js";

export type CatalogFilters = {
  query?: string;
  runtime?: Runtime;
  difficulty?: ProblemDefinition["difficulty"];
  format?: ProblemDefinition["format"];
  origin?: ProblemDefinition["origin"];
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function searchCatalog(problems: ProblemDefinition[], filters: CatalogFilters): ProblemDefinition[] {
  const query = normalize(filters.query?.trim() ?? "");
  return problems
    .filter((problem) => problem.status === "published" && problem.visibility === "public")
    .filter((problem) => !filters.runtime || problem.runtimes.some((item) => item.language === filters.runtime))
    .filter((problem) => !filters.difficulty || problem.difficulty === filters.difficulty)
    .filter((problem) => !filters.format || problem.format === filters.format)
    .filter((problem) => !filters.origin || problem.origin === filters.origin)
    .filter((problem) => !query || query.split(/\s+/).every((term) => normalize([problem.title, problem.summary, ...problem.tags].join(" ")).includes(term)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function problemFingerprint(problem: Pick<ProblemDefinition, "title" | "summary" | "tags">): string {
  const canonical = normalize(`${problem.title}|${problem.summary}|${[...problem.tags].sort().join(",")}`).replace(/[^a-z0-9|,]+/g, " ").trim();
  let hash = 2166136261;
  for (const character of canonical) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
