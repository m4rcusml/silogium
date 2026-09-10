import { describe, expect, it } from "vitest";
import { LocalAiAdapter } from "../../authoring/src/local-ai.js";
import { LocalJudgeAdapter } from "../src/local.js";
import { ExecutionResultSchema, prepareExecutionBundle } from "@silogium/core";

const actor = { id: "00000000-0000-4000-8000-000000000001", handle: "tester", role: "user" as const };

describe("LocalJudgeAdapter", () => {
  for (const runtime of ["typescript", "python"] as const) {
    it(`não confunde diagnósticos volumosos com saída da solução em ${runtime}`, async () => {
      const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "entrada grande sem saída", runtime, format: "progressive", difficulty: "easy", visibility: "private" }, actor);
      generated.problem.limits.outputBytes = 1024;
      generated.bundle.visibleCases = [{ kind: "call-sequence", id: "large-input", name: "Entrada grande", stage: 1, constructorArgs: [], calls: [{ method: "add", args: ["x".repeat(3000)], expected: 1 }] }];
      const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
        kind: "run", problemId: generated.problem.id, problemVersion: 1, runtime,
        source: runtime === "typescript" ? "export class SequenceWorkbench { add(value) { return 0; } }" : "class SequenceWorkbench:\n    def add(self, value):\n        return 0\n"
      });
      expect(result.verdict).toBe("wrong_answer");
      expect(result.cases[0]?.mismatch).toEqual({ expected: 1, actual: 0, method: "add" });
    }, 20_000);

    it(`devolve um diff JSON para falhas visíveis em ${runtime} e mantém ocultos protegidos`, async () => {
      const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "feedback estruturado", runtime, format: "progressive", difficulty: "easy", visibility: "private" }, actor);
      const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
        kind: "submission", problemId: generated.problem.id, problemVersion: 1, runtime, source: generated.problem.runtimes[0]!.starterCode
      });
      expect(ExecutionResultSchema.safeParse(result).success).toBe(true);
      expect(result.cases.find((test) => test.id === "visible-1")?.mismatch).toEqual({ expected: 1, actual: 0, method: "add", input: [3] });
      for (const test of result.cases.filter((test) => test.id.startsWith("hidden-"))) {
        expect(test.name).toBe("Teste oculto");
        expect(test.message).toBeUndefined();
        expect(test.mismatch).toBeUndefined();
      }
    }, 20_000);
  }

  it("executa só o caso solicitado e não contamina submissões posteriores", async () => {
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "casos personalizados", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    const request = { kind: "run" as const, problemId: generated.problem.id, problemVersion: 1, runtime: "typescript" as const, source: generated.bundle.referenceSolutions.typescript! };
    const customBundle = prepareExecutionBundle(generated.problem, generated.bundle, { ...request, customCases: [{ kind: "stdio", id: "custom", name: "Negativos", stage: 1, stdin: "3\n-2 -2 7\n", expectedStdout: "-2:2 7:1\n" }] });
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, customBundle, request);
    expect(result.verdict).toBe("accepted");
    expect(result.cases.map((test) => test.id)).toEqual(["custom"]);
    const submission = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, { ...request, kind: "submission" });
    expect(submission.cases.map((test) => test.id)).toEqual(["example", "single"]);
  }, 20_000);

  for (const runtime of ["typescript", "python"] as const) {
    for (const format of ["classic", "progressive"] as const) {
      it(`mantém paridade entre referência e testes para ${runtime}/${format}`, async () => {
        const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "estruturas de dados para o judge", runtime, format, difficulty: "medium", visibility: "private" }, actor);
        const source = generated.bundle.referenceSolutions[runtime]!;
        const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
          kind: "submission",
          problemId: generated.problem.id,
          problemVersion: generated.problem.version,
          runtime,
          source
        });
        expect(result.verdict).toBe("accepted");
        expect(result.score).toBe(result.maxScore);
      }, 20_000);
    }
  }

  it("não revela o nome nem a mensagem de um teste oculto que falhou", async () => {
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "contagem", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
      kind: "submission",
      problemId: generated.problem.id,
      problemVersion: 1,
      runtime: "typescript",
      source: generated.problem.runtimes[0]!.starterCode
    });
    const hidden = result.cases.find((item) => item.id === "single");
    expect(hidden?.name).toBe("Teste oculto");
    expect(hidden?.message).toBeUndefined();
  }, 20_000);

  it("classifica erro de compilação TypeScript", async () => {
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "compilação inválida", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
      kind: "run", problemId: generated.problem.id, problemVersion: 1, runtime: "typescript", source: "const value: = 1;"
    });
    expect(result.verdict).toBe("compile_error");
  });

  it("interrompe soluções que excedem o tempo por caso", async () => {
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "tempo limite controlado", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    generated.problem.limits.timeMs = 100;
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
      kind: "run", problemId: generated.problem.id, problemVersion: 1, runtime: "typescript", source: "for (;;) {}"
    });
    expect(result.verdict).toBe("time_limit");
  }, 10_000);

  it("interrompe soluções que excedem o limite de saída", async () => {
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "saída excessiva controlada", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    generated.problem.limits.outputBytes = 1_024;
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
      kind: "run", problemId: generated.problem.id, problemVersion: 1, runtime: "typescript", source: "console.log('x'.repeat(5000));"
    });
    expect(result.verdict).toBe("output_limit");
  }, 10_000);
});
