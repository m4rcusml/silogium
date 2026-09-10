import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { JudgeBundleSchema, ProblemDefinitionSchema, seedProblems, type JudgeCase } from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");
const classics = seedProblems.filter((problem) => problem.format === "classic");
const bundleFor = (slug: string) => JudgeBundleSchema.parse(JSON.parse(readFileSync(resolve(root, `content/judge/${slug}.visible.json`), "utf8")));
const numbers = (test: JudgeCase) => {
  if (test.kind !== "stdio") throw new Error("A fixture clássica deve usar stdio.");
  return test.stdin.trim().split(/\s+/).map(Number);
};

// Deliberately simple, independent oracles for the small public fixtures.
function pairOracle(values: number[]): string {
  const [n, target] = values;
  for (let j = 1; j < n!; j += 1) for (let i = 0; i < j; i += 1) {
    if (values[i + 2]! + values[j + 2]! === target) return `${i + 1} ${j + 1}\n`;
  }
  return "-1\n";
}

function intervalOracle(values: number[]): string {
  const intervals = Array.from({ length: values[0]! }, (_, i) => [values[2 * i + 1]!, values[2 * i + 2]!] as const);
  const points = [...new Set(intervals.flat())].sort((a, b) => a - b);
  let total = 0; let continuous = 0; let longest = 0;
  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1]!; const right = points[i]!;
    if (intervals.some(([start, end]) => start <= left && right <= end)) {
      total += right - left;
      continuous += right - left;
      longest = Math.max(longest, continuous);
    } else continuous = 0;
  }
  return `${total} ${longest}\n`;
}

function graphOracle(values: number[]): string {
  const [n, m, source, target] = values;
  let ways = Array<bigint>(n! + 1).fill(0n);
  ways[source!] = 1n;
  // Count walks of exactly d edges. The first nonzero destination count is
  // necessarily the number of shortest paths; no queue or visited-state logic.
  for (let d = 0; d < n!; d += 1) {
    if (ways[target!]! > 0n) return `${d} ${ways[target!]! % 1_000_000_007n}\n`;
    const next = Array<bigint>(n! + 1).fill(0n);
    for (let i = 0; i < m!; i += 1) {
      const u = values[4 + 2 * i]!; const v = values[5 + 2 * i]!;
      next[u] = next[u]! + ways[v]!;
      next[v] = next[v]! + ways[u]!;
    }
    ways = next;
  }
  return "-1 0\n";
}

describe("seeds clássicos públicos", () => {
  it("preserva os três seeds progressivos, suas versões e ordem com textos canônicos LF", () => {
    const hash = createHash("sha256").update(JSON.stringify(seedProblems.slice(0, 3))).digest("hex");
    // Golden from the original three definitions with CRLF -> LF only. It must
    // match on Linux CI and Windows without modifying the user's source files.
    expect(hash).toBe("4f711e2b200412da2152187a1a6b86a35e2c333868c6c96530e4722d82e9d210");
  });

  it("normaliza somente texto-fonte, sem alterar whitespace das fixtures stdio", () => {
    for (const problem of seedProblems) {
      for (const stage of problem.stages) expect(stage.statementMd).not.toContain("\r\n");
      for (const runtime of problem.runtimes) expect(runtime.starterCode).not.toContain("\r\n");
    }
    for (const problem of classics) {
      const whitespace = bundleFor(problem.slug).visibleCases.find((test) => test.id === "whitespace");
      expect(whitespace?.kind).toBe("stdio");
      if (whitespace?.kind === "stdio") expect(whitespace.stdin).toContain("\r\n");
    }
  });

  it("adiciona três questões distintas com contrato stdio e ambas as linguagens", () => {
    expect(classics.map((problem) => problem.slug)).toEqual(["pacotes-complementares", "janelas-de-manutencao", "rotas-da-estacao"]);
    expect(new Set(seedProblems.map((problem) => problem.id)).size).toBe(seedProblems.length);
    expect(new Set(seedProblems.map((problem) => problem.slug)).size).toBe(seedProblems.length);
    for (const problem of classics) {
      expect(ProblemDefinitionSchema.parse(problem)).toEqual(problem);
      expect(problem).toMatchObject({ version: 1, status: "published", visibility: "public", executionModel: "stdio", metadata: { format: "classic", runtimes: ["typescript", "python"] } });
      expect(problem.stages).toHaveLength(1);
      expect(problem.stages[0]!.points).toBe(100);
      expect(problem.runtimes.map((runtime) => runtime.language)).toEqual(["typescript", "python"]);
      for (const runtime of problem.runtimes) expect(runtime.entrypoint).toEqual({ kind: "stdio" });
      expect(problem.stages[0]!.statementMd).toContain("## Entrada");
      expect(problem.stages[0]!.statementMd).toContain("## Saída");
      expect(problem.stages[0]!.statementMd).toContain("## Implementação");
      expect(problem.metadata!.concepts.length).toBeGreaterThan(0);
      expect(problem.metadata!.keywords.length).toBeGreaterThan(0);
    }
  });

  it("entrega todos os casos visíveis, sem referências nem testes disfarçados de privados", () => {
    for (const problem of classics) {
      const bundle = bundleFor(problem.slug);
      expect(bundle).toMatchObject({ problemId: problem.id, problemVersion: problem.version, hiddenCases: [], referenceSolutions: {} });
      expect(bundle.visibleCases.length).toBeGreaterThanOrEqual(10);
      expect(new Set(bundle.visibleCases.map((test) => test.id)).size).toBe(bundle.visibleCases.length);
      for (const example of problem.examples) {
        expect(bundle.visibleCases.some((test) => test.kind === "stdio" && test.stdin === example.input && test.expectedStdout === example.output)).toBe(true);
      }
      for (const test of bundle.visibleCases) expect(test).toMatchObject({ kind: "stdio", stage: 1 });
    }
  });

  it("verifica as saídas pequenas por oráculos independentes das referências", () => {
    const oracles: Record<string, (values: number[]) => string> = {
      "pacotes-complementares": pairOracle, "janelas-de-manutencao": intervalOracle, "rotas-da-estacao": graphOracle
    };
    for (const problem of classics) for (const test of bundleFor(problem.slug).visibleCases) {
      if (test.id === "maximum-size") continue;
      if (test.kind !== "stdio") throw new Error("Esperado stdio.");
      expect(oracles[problem.slug]!(numbers(test)), `${problem.slug}/${test.id}`).toBe(test.expectedStdout);
    }
  });

  it("mantém todas as entradas dentro do contrato, inclusive os tamanhos máximos", () => {
    for (const problem of classics) for (const test of bundleFor(problem.slug).visibleCases) {
      const values = numbers(test);
      expect(values.every(Number.isSafeInteger)).toBe(true);
      const n = values[0]!;
      expect(n).toBeLessThanOrEqual(100_000);
      if (problem.slug === "pacotes-complementares") {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(values).toHaveLength(n + 2);
        expect(values[1]).toBeGreaterThanOrEqual(0);
        expect(values[1]).toBeLessThanOrEqual(2_000_000_000);
        expect(values.slice(2).every((value) => value >= 0 && value <= 1_000_000_000)).toBe(true);
      } else if (problem.slug === "janelas-de-manutencao") {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(values).toHaveLength(2 * n + 1);
        let valid = true;
        for (let i = 0; i < n; i += 1) valid &&= values[2 * i + 1]! >= 0 && values[2 * i + 1]! < values[2 * i + 2]! && values[2 * i + 2]! <= 1_000_000_000;
        expect(valid).toBe(true);
      } else {
        const m = values[1]!;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(200_000);
        expect(values).toHaveLength(2 * m + 4);
        expect(values.slice(2).every((value) => value >= 1 && value <= n)).toBe(true);
        const edges = new Set<string>(); let noLoops = true;
        for (let i = 0; i < m; i += 1) {
          const u = values[4 + 2 * i]!; const v = values[5 + 2 * i]!;
          noLoops &&= u !== v;
          edges.add(`${Math.min(u, v)},${Math.max(u, v)}`);
        }
        expect(noLoops).toBe(true);
        expect(edges.size).toBe(m);
      }
      if (test.id === "maximum-size") expect(n).toBe(100_000);
    }
  });
});
