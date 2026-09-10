import { describe, expect, it, vi } from "vitest";
import type { ExecutionResult, JudgeBundle, ProblemDefinition } from "@silogium/core";
import { LocalJudgeAdapter } from "../../judge/src/local.js";
import { LocalAiAdapter } from "../src/local-ai.js";
import { StructuralProblemValidator } from "../src/validator.js";
import { buildQualityMutations, fixturesAreConsistent, inspectCoverage, isJsonFixture } from "../src/quality.js";

const actor = { id: "quality-author", handle: "author", role: "user" as const };
async function fixture(runtime: "typescript" | "python" = "typescript", format: "classic" | "progressive" = "classic") {
  return new LocalAiAdapter().create({ mode: "create", prompt: "contagem com ordenação", runtime, format, difficulty: "medium", visibility: "private" }, actor);
}
function outcome(bundle: JudgeBundle, verdict: ExecutionResult["verdict"]): ExecutionResult {
  return {
    id: crypto.randomUUID(), verdict, score: verdict === "accepted" ? 100 : 0, maxScore: 100, durationMs: 1,
    cases: [...bundle.visibleCases, ...bundle.hiddenCases].map((test) => ({ id: test.id, name: test.name, stage: test.stage, passed: verdict === "accepted" }))
  };
}

describe("qualidade dos pacotes", () => {
  it("retorna erros de schema sem tentar acessar campos ausentes ou executar", async () => {
    const evaluate = vi.fn();
    const report = await new StructuralProblemValidator({ evaluate }).validate({} as ProblemDefinition, {} as JudgeBundle);
    expect(report.valid).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("rejeita IDs visíveis/ocultos repetidos antes de executar", async () => {
    const { problem, bundle } = await fixture();
    bundle.hiddenCases[0]!.id = bundle.visibleCases[0]!.id;
    const evaluate = vi.fn();
    const report = await new StructuralProblemValidator({ evaluate }).validate(problem, bundle);
    expect(report.checks).toContainEqual({ name: "identificadores únicos dos testes", passed: false });
    expect(report.valid).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("rejeita respostas contraditórias para o mesmo input", async () => {
    const { problem, bundle } = await fixture();
    bundle.hiddenCases = [{ ...bundle.visibleCases[0]!, id: "contradiction", kind: "stdio", stdin: "5\n3 1 3 2 1\n", expectedStdout: "outra resposta" }];
    const report = await new StructuralProblemValidator().validate(problem, bundle);
    expect(report.valid).toBe(false);
    expect(report.checks.find((check) => check.name.includes("consistentes"))?.passed).toBe(false);
  });

  it("rejeita contradição em prefixos de chamadas mesmo com finais diferentes", () => {
    expect(fixturesAreConsistent([
      { kind: "call-sequence", id: "one", name: "one", stage: 1, constructorArgs: [], calls: [{ method: "add", args: [1], expected: 1 }] },
      { kind: "call-sequence", id: "two", name: "two", stage: 2, constructorArgs: [], calls: [{ method: "add", args: [1], expected: 2 }, { method: "size", args: [], expected: 1 }] }
    ])).toBe(false);
  });

  it("não compara como iguais estados ou construtores diferentes", () => {
    expect(fixturesAreConsistent([
      { kind: "call-sequence", id: "one", name: "one", stage: 1, constructorArgs: [0], calls: [{ method: "add", args: [1], expected: 1 }, { method: "add", args: [1], expected: 2 }] },
      { kind: "call-sequence", id: "two", name: "two", stage: 2, constructorArgs: [10], calls: [{ method: "add", args: [1], expected: 11 }] }
    ])).toBe(true);
  });

  it("rejeita fases sem sequência e fixture incompatível com entrypoint", async () => {
    const { problem, bundle } = await fixture();
    problem.stages[0]!.number = 4;
    problem.runtimes[0]!.entrypoint = { kind: "class", symbol: "Example", methodMap: {} };
    const report = await new StructuralProblemValidator().validate(problem, bundle);
    expect(report.valid).toBe(false);
    expect(report.checks.find((check) => check.name === "estágios consecutivos")?.passed).toBe(false);
    expect(report.checks.find((check) => check.name === "entrypoint typescript")?.passed).toBe(false);
  });

  it("não certifica referência accepted com casos faltantes", async () => {
    const { problem, bundle } = await fixture();
    const evaluate = vi.fn(async () => ({ ...outcome(bundle, "accepted"), cases: [] }));
    expect((await new StructuralProblemValidator({ evaluate }).validate(problem, bundle)).valid).toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("não conta falha de infra/compilação de mutante como detecção", async () => {
    const { problem, bundle } = await fixture();
    const evaluate = vi.fn(async (_p, _b, request) => outcome(bundle,
      request.source === bundle.referenceSolutions.typescript ? "accepted" : request.source === problem.runtimes[0]!.starterCode ? "wrong_answer" : "system_error"));
    const report = await new StructuralProblemValidator({ evaluate }).validate(problem, bundle);
    expect(report.valid).toBe(false);
    expect(report.coverage?.mutationChecks.every((check) => check.status === "inconclusive")).toBe(true);
  });

  it("identifica mutante sabidamente errado que o judge aceitou", async () => {
    const { problem, bundle } = await fixture();
    const evaluate = vi.fn(async (_p, _b, request) => outcome(bundle, request.source === problem.runtimes[0]!.starterCode ? "wrong_answer" : "accepted"));
    const report = await new StructuralProblemValidator({ evaluate }).validate(problem, bundle);
    expect(report.valid).toBe(false);
    expect(report.coverage?.mutationChecks.every((check) => check.status === "survived")).toBe(true);
  });

  it("não rejeita variante constante equivalente em questão de saída constante", async () => {
    const { problem, bundle } = await fixture();
    for (const test of [...bundle.visibleCases, ...bundle.hiddenCases]) if (test.kind === "stdio") test.expectedStdout = "Hello world\n";
    expect(buildQualityMutations(problem.runtimes[0]!, bundle).find((mutation) => mutation.name === "resposta constante")?.source).toBeUndefined();
  });

  it("relata cobertura como indícios e alerta quando validação foi apenas estrutural", async () => {
    const { problem, bundle } = await fixture("python", "progressive");
    const report = await new StructuralProblemValidator().validate(problem, bundle);
    expect(report.valid).toBe(true);
    expect(report.warnings?.some((warning) => warning.includes("apenas estrutural"))).toBe(true);
    expect(inspectCoverage(bundle).observedSignals).toContain("operação repetida");
  });

  it("fixtures JSON não aceitam valores não finitos, undefined ou ciclos", () => {
    const cyclic: unknown[] = []; cyclic.push(cyclic);
    expect(isJsonFixture(cyclic)).toBe(false);
    expect(isJsonFixture(new Array(1))).toBe(false);
    expect(isJsonFixture({ expected: undefined })).toBe(false);
    expect(isJsonFixture({ args: [NaN] })).toBe(false);
    expect(isJsonFixture({ expected: new Date() })).toBe(false);
    expect(isJsonFixture({ args: [0, null, false, ""], expected: { ok: true } })).toBe(true);
  });

  it("respeita igualdade de dicionários e booleanos no judge Python", () => {
    const cases = [
      { kind: "call-sequence" as const, id: "a", name: "a", stage: 1, constructorArgs: [], calls: [{ method: "read", args: [], expected: { a: 1, b: true } }] },
      { kind: "call-sequence" as const, id: "b", name: "b", stage: 1, constructorArgs: [], calls: [{ method: "read", args: [], expected: { b: 1, a: 1 } }] }
    ];
    expect(fixturesAreConsistent(cases, "python")).toBe(true);
    expect(fixturesAreConsistent(cases, "typescript")).toBe(false);
  });

  it("não chama wrong_answer sem casos de detecção de mutante", async () => {
    const { problem, bundle } = await fixture();
    const evaluate = vi.fn(async (_p, _b, request) => request.source === bundle.referenceSolutions.typescript ? outcome(bundle, "accepted") : { ...outcome(bundle, "wrong_answer"), cases: [] });
    const report = await new StructuralProblemValidator({ evaluate }).validate(problem, bundle);
    expect(report.valid).toBe(false);
    expect(report.coverage?.mutationChecks.every((check) => check.status === "inconclusive")).toBe(true);
  });

  it.each(["typescript", "python"] as const)("executa referência, starter e mutantes reais em %s", async (runtime) => {
    for (const format of ["classic", "progressive"] as const) {
      const { problem, bundle } = await fixture(runtime, format);
      const report = await new StructuralProblemValidator(new LocalJudgeAdapter()).validate(problem, bundle);
      expect(report.checks.filter((check) => !check.passed)).toEqual([]);
      expect(report.valid).toBe(true);
      expect(report.coverage?.mutationChecks.some((check) => check.status === "killed")).toBe(true);
    }
  }, 60_000);
});
