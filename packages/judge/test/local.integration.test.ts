import { describe, expect, it } from "vitest";
import { LocalAiAdapter } from "../../authoring/src/local-ai.js";
import { LocalJudgeAdapter } from "../src/local.js";

const actor = { id: "00000000-0000-4000-8000-000000000001", handle: "tester", role: "user" as const };

describe("LocalJudgeAdapter", () => {
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
