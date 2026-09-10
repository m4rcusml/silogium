import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryMetadataSchema } from "@silogium/core";
import { ExercismAdapter } from "../src/exercism.js";
import { MIT_TEXT } from "./fixtures/exercism-source.js";

afterEach(() => vi.restoreAllMocks());

function mockTrack(exercises: unknown[], options: { license?: string; configStatus?: number; licenseStatus?: number } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/LICENSE")) return new Response(options.license ?? MIT_TEXT, { status: options.licenseStatus ?? 200 });
    if (url.endsWith("/config.json")) return new Response(JSON.stringify({ exercises: { practice: exercises } }), { status: options.configStatus ?? 200 });
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("descoberta licenciada do Exercism por metadados", () => {
  it("encontra conceitos em português nos metadados ingleses sem copiar enunciados", async () => {
    const fetchMock = mockTrack([
      { slug: "word-count", name: "Word Count", practices: ["dictionaries", "strings"] },
      { slug: "binary-search", name: "Binary Search", practices: ["binary-search", "arrays"] }
    ]);
    const results = await new ExercismAdapter().search("Quero praticar dicionários em TypeScript.", "typescript");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "exercism-typescript-word-count",
      title: "Word Count",
      kind: "licensed_import",
      runtime: "typescript",
      sourceName: "Exercism",
      url: "https://github.com/exercism/typescript/tree/main/exercises/practice/word-count",
      licenseSpdx: "MIT",
      importable: true,
      metadata: { concepts: expect.arrayContaining(["hash-map", "string"]), format: "classic", difficulty: "unknown", inferred: true },
      matchReasons: expect.arrayContaining([expect.stringContaining("dicionários")])
    });
    expect(DiscoveryMetadataSchema.safeParse(results[0]?.metadata).success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes("instructions.md"))).toBe(true);
  });

  it("não associa os conceitos da consulta a um exercício de outro assunto", async () => {
    mockTrack([{ slug: "two-fer", name: "Two Fer", practices: ["strings"] }]);
    expect(await new ExercismAdapter().search("Uma questão progressiva difícil sobre grafos usando Python.", "python")).toEqual([]);
    expect(await new ExercismAdapter().search("Quero criar uma questão em Python para praticar.", "python")).toEqual([]);
  });

  it("ordena deterministicamente, limita recomendações e preserva o track solicitado", async () => {
    mockTrack([
      { slug: "zeta", name: "Zeta", practices: ["arrays"] },
      { slug: "beta", name: "Beta", practices: ["arrays"] },
      { slug: "delta", name: "Delta", practices: ["arrays"] },
      { slug: "alpha", name: "Alpha", practices: ["arrays"] }
    ]);
    const results = await new ExercismAdapter().search("Quero exercitar vetores.", "python");
    expect(results.map((candidate) => candidate.title)).toEqual(["Alpha", "Beta", "Delta"]);
    expect(results.every((candidate) => candidate.runtime === "python" && candidate.url.startsWith("https://github.com/exercism/python/tree/main/exercises/practice/"))).toBe(true);
    expect(results.every((candidate) => candidate.similarity && candidate.similarity > 0)).toBe(true);
  });

  it.each([
    { license: "GNU General Public License" },
    { license: "MIT License without permission clause" },
    { license: `${MIT_TEXT}\nAdditional restriction: noncommercial use only.` },
    { licenseStatus: 404 },
    { configStatus: 500 }
  ])("exige licença MIT e configuração confirmadas: %j", async (options) => {
    mockTrack([{ slug: "word-count", name: "Word Count", practices: ["dictionaries"] }], options);
    expect(await new ExercismAdapter().search("dicionários", "typescript")).toEqual([]);
  });

  it("descarta entradas inválidas sem fabricar fonte ou descartar resultados válidos", async () => {
    mockTrack([
      { slug: "../secret", name: "Dictionary", practices: ["dictionaries"] },
      { slug: "valid", name: "", practices: ["dictionaries"] },
      null,
      { slug: "word-count", name: "Word Count", practices: [null, 42, "dictionaries"] }
    ]);
    const results = await new ExercismAdapter().search("dicionários", "typescript");
    expect(results.map((candidate) => candidate.title)).toEqual(["Word Count"]);
    expect(results[0]?.summary).not.toContain("null");
    expect(results[0]?.summary).not.toContain("42");
  });

  it("retorna vazio quando a rede falha sem tentar baixar o enunciado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await new ExercismAdapter().search("arrays", "python")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
