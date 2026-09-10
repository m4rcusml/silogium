import { afterEach, describe, expect, it, vi } from "vitest";
import { renderProblemAttribution, seedProblems } from "@silogium/core";
import { licensedProvenance } from "../src/licensed-provenance.js";
import { ExercismAdapter } from "../src/exercism.js";
import { MIT_TEXT, mockSnapshot, SOURCE_SHA } from "./fixtures/exercism-source.js";

afterEach(() => vi.restoreAllMocks());
describe("atribuição determinística de importações", () => {
  it("conserva licença, autoria e hashes sem publicar o conteúdo privado da captura", async () => {
    mockSnapshot();
    const source = await new ExercismAdapter().load("two-fer", "typescript");
    const provenance = licensedProvenance(source, { id: "requester", handle: "buscador", role: "user" });
    expect(provenance).toMatchObject({ kind: "licensed_import", authors: ["autor"], importedBy: "requester", commitSha: SOURCE_SHA, sourceSnapshot: { commitSha: SOURCE_SHA } });
    const json = JSON.stringify(provenance);
    expect(json).not.toContain("export function twoFer");
    expect(json).not.toContain("test('two fer'");
    const text = renderProblemAttribution({ ...seedProblems[0]!, origin: "licensed_import", provenance });
    expect(text).toContain(MIT_TEXT);
    expect(text).toContain("Autoria original: autor");
    expect(text).not.toContain("Autoria original: buscador");
    expect(text).toContain(SOURCE_SHA);
  });
  it("não modifica o snapshot quando o DTO é alterado", async () => {
    mockSnapshot();
    const source = await new ExercismAdapter().load("two-fer", "typescript");
    const provenance = licensedProvenance(source, { id: "requester", handle: "buscador", role: "user" });
    if (provenance.kind !== "licensed_import") throw new Error("invalid fixture");
    provenance.authors.push("outro");
    expect(source.authors).toEqual(["autor"]);
    expect(provenance.legalNotices).toHaveLength(1);
    expect(provenance.sourceSnapshot?.files.every((file) => !Object.hasOwn(file, "content"))).toBe(true);
  });
});
