import type { Runtime } from "@silogium/core";

export const MAX_CUSTOM_TEST_LENGTH = 250_000;
export type WorkspacePreferences = {
  fontSize: number;
  wordWrap: boolean;
  split: number;
  resultHeight: number;
  customTests: string;
};
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export type PreferenceStatus = "saved" | "recovered" | "unavailable";

export function workspacePreferenceKey(actorId: string, problemId: string, version: number, runtime: Runtime) {
  return `silogium:workspace:v1:${[actorId, problemId, String(version), runtime].map(encodeURIComponent).join(":")}`;
}

export function defaultWorkspacePreferences(customTests: string): WorkspacePreferences {
  return { fontSize: 14, wordWrap: true, split: 42, resultHeight: 34, customTests };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Validate storage hints only. Incomplete/empty JSON remains a legitimate test draft. */
export function normalizeWorkspacePreferences(value: unknown, fallback: WorkspacePreferences): WorkspacePreferences {
  const input = record(value) ?? {};
  const bounded = (value: unknown, min: number, max: number, fallback: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  return {
    fontSize: typeof input.fontSize === "number" && [12, 14, 16, 18].includes(input.fontSize) ? input.fontSize : fallback.fontSize,
    wordWrap: typeof input.wordWrap === "boolean" ? input.wordWrap : fallback.wordWrap,
    split: bounded(input.split, 30, 66, fallback.split),
    resultHeight: bounded(input.resultHeight, 20, 75, fallback.resultHeight),
    customTests: typeof input.customTests === "string" && input.customTests.length <= MAX_CUSTOM_TEST_LENGTH ? input.customTests : fallback.customTests
  };
}

export function readWorkspacePreferences(storage: PreferenceStorage, key: string, fallback: WorkspacePreferences): { value: WorkspacePreferences; status: PreferenceStatus } {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { value: fallback, status: "saved" };
    if (raw.length > MAX_CUSTOM_TEST_LENGTH * 6 + 1_024) return { value: fallback, status: "recovered" };
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schemaVersion !== 1) return { value: fallback, status: "recovered" };
    const value = normalizeWorkspacePreferences(parsed, fallback);
    const recovered = Object.entries(value).some(([field, item]) => parsed[field] !== item);
    return { value, status: recovered ? "recovered" : "saved" };
  } catch (error) {
    return { value: fallback, status: error instanceof SyntaxError ? "recovered" : "unavailable" };
  }
}

export function writeWorkspacePreferences(storage: PreferenceStorage, key: string, value: WorkspacePreferences): PreferenceStatus {
  try {
    storage.setItem(key, JSON.stringify({ schemaVersion: 1, ...value }));
    return "saved";
  } catch {
    return "unavailable";
  }
}

export type CatalogFilters = {
  query: string;
  runtime: Runtime | "";
  difficulty: "easy" | "medium" | "hard" | "";
  format: "classic" | "progressive" | "";
  collection: "all" | "classic" | "progressive" | "native" | "imported";
  progressFilter: "solved" | "in_progress" | "not_started" | "";
};
export const DEFAULT_CATALOG_FILTERS: CatalogFilters = { query: "", runtime: "", difficulty: "", format: "", collection: "all", progressFilter: "" };
const catalogParameters = { query: "q", runtime: "runtime", difficulty: "difficulty", format: "format", collection: "collection", progressFilter: "progress" } as const;

export function normalizeCatalogFilters(value: unknown): CatalogFilters {
  const input = record(value) ?? {};
  const choice = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;
  const filters: CatalogFilters = {
    query: typeof input.query === "string" ? input.query.slice(0, 200).replace(/[\u0000-\u001f\u007f]/g, "") : "",
    runtime: choice(input.runtime, ["", "typescript", "python"] as const, ""),
    difficulty: choice(input.difficulty, ["", "easy", "medium", "hard"] as const, ""),
    format: choice(input.format, ["", "classic", "progressive"] as const, ""),
    collection: choice(input.collection, ["all", "classic", "progressive", "native", "imported"] as const, "all"),
    progressFilter: choice(input.progressFilter, ["", "solved", "in_progress", "not_started"] as const, "")
  };
  // Explicit format wins over the two format shortcuts; avoid contradictory controls.
  if (filters.format && (filters.collection === "classic" || filters.collection === "progressive")) filters.collection = "all";
  return filters;
}

export function catalogPreferenceKey(actorId: string) { return `silogium:catalog-filters:v1:${encodeURIComponent(actorId)}`; }

/** An explicit URL replaces the whole saved filter set, not just selected fields. */
export function readCatalogUrl(search: URLSearchParams): CatalogFilters | null {
  if (!Object.values(catalogParameters).some((parameter) => search.has(parameter))) return null;
  return normalizeCatalogFilters(Object.fromEntries(Object.entries(catalogParameters).map(([field, parameter]) => [field, search.get(parameter)])));
}

export function writeCatalogUrl(url: URL, filters: CatalogFilters): URL {
  const next = new URL(url);
  const clean = normalizeCatalogFilters(filters);
  for (const [field, parameter] of Object.entries(catalogParameters)) {
    const value = clean[field as keyof CatalogFilters];
    if (value && value !== "all") next.searchParams.set(parameter, value);
    else next.searchParams.delete(parameter);
  }
  return next;
}

export function readCatalogPreferences(storage: PreferenceStorage, actorId: string): { value: CatalogFilters; status: PreferenceStatus } {
  try {
    const raw = storage.getItem(catalogPreferenceKey(actorId));
    if (raw === null) return { value: { ...DEFAULT_CATALOG_FILTERS }, status: "saved" };
    if (raw.length > 4_096) return { value: { ...DEFAULT_CATALOG_FILTERS }, status: "recovered" };
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schemaVersion !== 1) return { value: { ...DEFAULT_CATALOG_FILTERS }, status: "recovered" };
    const value = normalizeCatalogFilters(parsed);
    return { value, status: Object.entries(value).some(([field, item]) => parsed[field] !== item) ? "recovered" : "saved" };
  } catch (error) {
    return { value: { ...DEFAULT_CATALOG_FILTERS }, status: error instanceof SyntaxError ? "recovered" : "unavailable" };
  }
}

export function writeCatalogPreferences(storage: PreferenceStorage, actorId: string, filters: CatalogFilters): PreferenceStatus {
  try {
    storage.setItem(catalogPreferenceKey(actorId), JSON.stringify({ schemaVersion: 1, ...normalizeCatalogFilters(filters) }));
    return "saved";
  } catch { return "unavailable"; }
}
