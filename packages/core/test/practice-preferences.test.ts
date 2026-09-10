import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_FILTERS, MAX_CUSTOM_TEST_LENGTH, catalogPreferenceKey, defaultWorkspacePreferences, normalizeCatalogFilters, normalizeWorkspacePreferences, readCatalogPreferences, readCatalogUrl, readWorkspacePreferences, workspacePreferenceKey, writeCatalogPreferences, writeCatalogUrl, writeWorkspacePreferences, type PreferenceStorage } from "../../../apps/web/lib/practice-preferences.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const defaults = defaultWorkspacePreferences("[{\"draft\":true}]");

describe("workspace preference storage", () => {
  it("separates actor, problem, version and runtime including delimiter-like IDs", () => {
    const keys = [workspacePreferenceKey("a", "p", 1, "typescript"), workspacePreferenceKey("b", "p", 1, "typescript"), workspacePreferenceKey("a", "q", 1, "typescript"), workspacePreferenceKey("a", "p", 2, "typescript"), workspacePreferenceKey("a", "p", 1, "python"), workspacePreferenceKey("a:p", "p", 1, "typescript")];
    expect(new Set(keys).size).toBe(keys.length);
    expect(workspacePreferenceKey("a:p", "p", 1, "typescript")).toContain("a%3Ap");
  });

  it.each(["", "[{", "[]"])("preserves incomplete or empty custom drafts exactly: %s", (customTests) => {
    const storage = memoryStorage();
    const value = { ...defaults, customTests, wordWrap: false, fontSize: 18, split: 66, resultHeight: 75 };
    expect(writeWorkspacePreferences(storage, "key", value)).toBe("saved");
    expect(readWorkspacePreferences(storage, "key", defaults)).toEqual({ value, status: "saved" });
  });

  it("falls back field by field without accepting absurd dimensions or extra payload", () => {
    const value = normalizeWorkspacePreferences({ fontSize: 99, split: -1, resultHeight: Infinity, wordWrap: "false", customTests: "meus testes", referenceSolutions: "never" }, defaults);
    expect(value).toEqual({ ...defaults, customTests: "meus testes" });
    expect(normalizeWorkspacePreferences({ fontSize: 12, split: 30, resultHeight: 20, wordWrap: false, customTests: "x".repeat(MAX_CUSTOM_TEST_LENGTH + 1) }, defaults)).toEqual({ ...defaults, fontSize: 12, split: 30, resultHeight: 20, wordWrap: false });
  });

  it("does not replace corrupt or future data just by reading it", () => {
    const storage = memoryStorage();
    for (const raw of ["{", "null", "[]", '{"schemaVersion":2}', "x".repeat(MAX_CUSTOM_TEST_LENGTH * 6 + 1_025)]) {
      storage.setItem("key", raw);
      expect(readWorkspacePreferences(storage, "key", defaults)).toEqual({ value: defaults, status: "recovered" });
      expect(storage.getItem("key")).toBe(raw);
    }
  });

  it("handles unavailable storage without erasing working values", () => {
    const storage: PreferenceStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
    expect(readWorkspacePreferences(storage, "key", defaults)).toEqual({ value: defaults, status: "unavailable" });
    expect(writeWorkspacePreferences(storage, "key", { ...defaults, customTests: "work" })).toBe("unavailable");
  });

  it("reading another runtime never resets existing preferences or source drafts", () => {
    const storage = memoryStorage();
    const tsKey = workspacePreferenceKey("a", "p", 1, "typescript");
    const pyKey = workspacePreferenceKey("a", "p", 1, "python");
    storage.setItem("silogium:draft:a:p:1:typescript", "my source");
    writeWorkspacePreferences(storage, tsKey, { ...defaults, fontSize: 18 });
    expect(readWorkspacePreferences(storage, pyKey, defaults).value).toEqual(defaults);
    expect(readWorkspacePreferences(storage, tsKey, defaults).value.fontSize).toBe(18);
    expect(storage.getItem("silogium:draft:a:p:1:typescript")).toBe("my source");
  });
});

describe("catalog preference and URL contract", () => {
  it("uses the complete URL snapshot instead of merging stale cached filters", () => {
    expect(readCatalogUrl(new URLSearchParams("q=filas"))).toEqual({ ...DEFAULT_CATALOG_FILTERS, query: "filas" });
    expect(readCatalogUrl(new URLSearchParams("q="))).toEqual(DEFAULT_CATALOG_FILTERS);
    expect(readCatalogUrl(new URLSearchParams("view=activity"))).toBeNull();
  });

  it("validates enums and query size; an explicit format overrides a conflicting shortcut", () => {
    expect(normalizeCatalogFilters({ query: "x".repeat(201), runtime: "rust", difficulty: "extreme", format: "classic", collection: "progressive", progressFilter: "approved" })).toEqual({ ...DEFAULT_CATALOG_FILTERS, query: "x".repeat(200), format: "classic" });
    expect(normalizeCatalogFilters({ query: "filas\u0000\n" }).query).toBe("filas");
  });

  it("round trips all filters while preserving other features' query parameters and hash", () => {
    const value = { query: "mapas e filas", runtime: "python" as const, difficulty: "medium" as const, format: "progressive" as const, collection: "native" as const, progressFilter: "solved" as const };
    const url = writeCatalogUrl(new URL("https://silogium.test/explorar?view=activity&list=personal#results"), value);
    expect(readCatalogUrl(url.searchParams)).toEqual(value);
    const cleared = writeCatalogUrl(url, DEFAULT_CATALOG_FILTERS);
    expect(cleared.href).toBe("https://silogium.test/explorar?view=activity&list=personal#results");
  });

  it("stores account filters separately and clearing one never deletes the other or density", () => {
    const storage = memoryStorage();
    storage.setItem("silogium:catalog-density", "comfortable");
    writeCatalogPreferences(storage, "a", { ...DEFAULT_CATALOG_FILTERS, query: "filas" });
    writeCatalogPreferences(storage, "b", { ...DEFAULT_CATALOG_FILTERS, runtime: "python" });
    writeCatalogPreferences(storage, "a", DEFAULT_CATALOG_FILTERS);
    expect(readCatalogPreferences(storage, "a").value).toEqual(DEFAULT_CATALOG_FILTERS);
    expect(readCatalogPreferences(storage, "b").value.runtime).toBe("python");
    expect(storage.getItem("silogium:catalog-density")).toBe("comfortable");
  });

  it("reports malformed and unavailable catalog storage without modifying it", () => {
    const storage = memoryStorage();
    storage.setItem(catalogPreferenceKey("a"), "{");
    expect(readCatalogPreferences(storage, "a").status).toBe("recovered");
    expect(storage.getItem(catalogPreferenceKey("a"))).toBe("{");
    expect(readCatalogPreferences({ getItem() { throw new Error("blocked"); }, setItem() {} }, "a").status).toBe("unavailable");
  });
});
