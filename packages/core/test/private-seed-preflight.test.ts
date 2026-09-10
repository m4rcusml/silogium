import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seedProblems, type JudgeBundle } from "../src/index.js";
import { assertExternalPrivateDirectory, privateClassicCases, validateSeedBundle } from "../../../scripts/lib/private-seeds.js";

const classic = seedProblems.find((problem) => problem.slug === "pacotes-complementares")!;
const bundle = (): JudgeBundle => ({ schemaVersion: 1, problemId: classic.id, problemVersion: 1,
  visibleCases: [{ kind: "stdio", id: "visible", name: "Exemplo", stage: 1, stdin: "2 5\n2 3\n", expectedStdout: "1 2\n" }],
  hiddenCases: [{ kind: "stdio", id: "private", name: "Privado", stage: 1, stdin: "3 8\n1 2 6\n", expectedStdout: "2 3\n" }],
  referenceSolutions: { typescript: "// trusted reference", python: "# trusted reference" } });

describe("preflight de bundles para publicação", () => {
  it("aceita um pacote completo e preserva a definição pública", () => {
    expect(validateSeedBundle(classic, bundle(), true)).toEqual(bundle());
  });
  it("recusa faltar privacidade/identidade/referência antes de qualquer escrita remota", () => {
    expect(() => validateSeedBundle(classic, { ...bundle(), hiddenCases: [] }, true)).toThrow("falta teste privado");
    expect(() => validateSeedBundle(classic, { ...bundle(), problemVersion: 2 }, true)).toThrow("identidade");
    expect(() => validateSeedBundle(classic, { ...bundle(), referenceSolutions: { python: "pass" } }, true)).toThrow("typescript");
    const invalid = bundle(); invalid.hiddenCases[0]!.stage = 2;
    expect(() => validateSeedBundle(classic, invalid, true)).toThrow("estágio");
  });
  it("não aceita renomear um teste visível para considerá-lo oculto", () => {
    const invalid = bundle(); invalid.hiddenCases = [{ ...invalid.visibleCases[0]!, id: "disguised" }];
    expect(() => validateSeedBundle(classic, invalid, true)).toThrow("repete uma entrada pública");
    invalid.hiddenCases[0]!.id = "visible";
    expect(() => validateSeedBundle(classic, invalid, true)).toThrow("IDs");
  });
  it("resolve junctions e recusa pastas dentro do checkout", () => {
    const directory = mkdtempSync(join(tmpdir(), "silogium-seed-test-"));
    try {
      const repo = join(directory, "repo"), external = join(directory, "private"), internal = join(repo, "private");
      mkdirSync(internal, { recursive: true }); mkdirSync(external);
      expect(assertExternalPrivateDirectory(repo, external)).toBe(realpathSync(external));
      expect(() => assertExternalPrivateDirectory(repo, internal)).toThrow("fora do repositório");
      expect(() => assertExternalPrivateDirectory(repo, repo)).toThrow("fora do repositório");
      const link = join(directory, "link-to-internal");
      symlinkSync(internal, link, process.platform === "win32" ? "junction" : "dir");
      expect(() => assertExternalPrivateDirectory(repo, link)).toThrow("fora do repositório");
    } finally {
      // Only this test's freshly created temporary directory is removed.
      if (!directory.startsWith(join(tmpdir(), "silogium-seed-test-"))) throw new Error("unsafe cleanup");
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each(["pacotes-complementares", "janelas-de-manutencao", "rotas-da-estacao"])("gera entradas novas, pequenas e tipadas para %s", (slug) => {
    const problem = seedProblems.find((item) => item.slug === slug)!;
    const first = privateClassicCases(slug), second = privateClassicCases(slug);
    expect(first).toHaveLength(9);
    expect(new Set([...first, ...second].map((test) => test.id)).size).toBe(18);
    expect(first).not.toEqual(second);
    const validated = validateSeedBundle(problem, { ...bundle(), problemId: problem.id, visibleCases: [], hiddenCases: first }, true);
    for (const test of validated.hiddenCases) {
      expect(test.kind).toBe("stdio");
      if (test.kind === "stdio") {
        expect(test.stdin.length).toBeLessThan(10000);
        expect(test.expectedStdout).toMatch(/^-?\d+( \d+)?\n$/);
      }
    }
  });
});
