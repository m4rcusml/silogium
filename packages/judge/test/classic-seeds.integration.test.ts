import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { JudgeBundleSchema, seedProblems } from "@silogium/core";
import { LocalJudgeAdapter } from "../src/local.js";

const root = resolve(import.meta.dirname, "../../..");
const classics = seedProblems.filter((problem) => problem.format === "classic");
const judge = new LocalJudgeAdapter();
const bundleFor = (slug: string) => JudgeBundleSchema.parse(JSON.parse(readFileSync(resolve(root, `content/judge/${slug}.visible.json`), "utf8")));

describe("referências dos seeds clássicos no judge real", () => {
  it("tem exatamente três questões para verificar, sem sucesso vacuamente vazio", () => expect(classics).toHaveLength(3));

  for (const problem of classics) for (const runtime of ["typescript", "python"] as const) {
    it(`${problem.slug}/${runtime}: referência aceita em todas as fixtures públicas`, async () => {
      const extension = runtime === "typescript" ? "ts" : "py";
      const source = readFileSync(resolve(root, `reference-solutions/${runtime}/${problem.slug}.${extension}`), "utf8");
      const bundle = bundleFor(problem.slug);
      const result = await judge.evaluate(problem, bundle, { kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime, source });
      expect(result.verdict, JSON.stringify(result)).toBe("accepted");
      expect(result).toMatchObject({ score: 100, maxScore: 100 });
      expect(result.cases).toHaveLength(bundle.visibleCases.length);
    }, 40_000);

    it(`${problem.slug}/${runtime}: starter válido não entrega a solução`, async () => {
      const source = problem.runtimes.find((item) => item.language === runtime)!.starterCode;
      const bundle = bundleFor(problem.slug);
      const result = await judge.evaluate(problem, bundle, { kind: "run", problemId: problem.id, problemVersion: problem.version, runtime, source });
      expect(result.verdict, JSON.stringify(result)).toBe("wrong_answer");
      // The existing judge awards proportional partial credit even within a stage.
      // Placeholders may match empty/impossible cases, but cannot solve the problem.
      expect(result.score).toBeLessThan(result.maxScore);
      expect(result.maxScore).toBe(100);
      expect(result.cases).toHaveLength(bundle.visibleCases.length);
    }, 40_000);
  }

  for (const mutation of [
    { slug: "pacotes-complementares", from: "if (!firstIndex.has(volume))", to: "if (true)", killedBy: "first-index", name: "substituir o primeiro índice" },
    { slug: "janelas-de-manutencao", from: "nextStart <= end", to: "nextStart < end", killedBy: "touching", name: "separar intervalos contíguos" },
    { slug: "rotas-da-estacao", from: "(ways[v]! + ways[u]!) % MOD", to: "ways[u]!", killedBy: "late-parent", name: "ignorar pais adicionais na BFS" },
    { slug: "rotas-da-estacao", from: "(ways[v]! + ways[u]!) % MOD", to: "ways[v]! + ways[u]!", killedBy: "modulo", name: "esquecer o módulo da contagem" }
  ]) {
    it(`as fixtures rejeitam ${mutation.name}`, async () => {
      const problem = classics.find((item) => item.slug === mutation.slug)!;
      const reference = readFileSync(resolve(root, `reference-solutions/typescript/${mutation.slug}.ts`), "utf8");
      expect(reference).toContain(mutation.from);
      const source = reference.replace(mutation.from, mutation.to);
      const bundle = bundleFor(problem.slug);
      // The precise public counterexample makes this a semantic assertion,
      // not an accidental timeout/compile failure from a large input.
      bundle.visibleCases = bundle.visibleCases.filter((test) => test.id === mutation.killedBy);
      expect(bundle.visibleCases).toHaveLength(1);
      const result = await judge.evaluate(problem, bundle, { kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime: "typescript", source });
      expect(result.verdict, JSON.stringify(result)).toBe("wrong_answer");
      expect(result.cases[0]).toMatchObject({ id: mutation.killedBy, passed: false });
    }, 15_000);
  }
});
