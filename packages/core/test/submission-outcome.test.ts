import { describe, expect, it } from "vitest";
import type { ExecutionResult, ProblemDefinition, Runtime } from "../src/schemas.js";
import { getSubmissionOutcome, type SubmissionContext } from "../../../apps/web/components/submission-outcome.js";

function problem(format: ProblemDefinition["format"] = "progressive"): ProblemDefinition {
  return {
    schemaVersion: 1, id: "54000000-0000-4000-8000-000000000001", version: 2, slug: "example", title: "Questão de teste",
    summary: "Fixture para classificação de resultado.", locale: "pt-BR", origin: "native", visibility: "private", status: "validated",
    format, executionModel: format === "classic" ? "stdio" : "call-sequence", difficulty: "medium", tags: ["test"],
    stages: (format === "classic" ? [1] : [1, 2, 3, 4]).map((number) => ({ number, points: format === "classic" ? 100 : 150, statementMd: "Implemente os requisitos." })),
    runtimes: (["typescript", "python"] as Runtime[]).map((language) => ({ language, version: language === "typescript" ? "22.22.0" : "3.13.11", starterCode: "// incomplete", entrypoint: { kind: "stdio" } })),
    examples: [], limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
    provenance: { kind: "native", createdBy: "owner", assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
    createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z"
  };
}
const context = (patch: Partial<SubmissionContext> = {}): SubmissionContext => ({ kind: "submission", runtime: "typescript", maxStage: 4, scope: "official", ...patch });
function accepted(definition = problem()): ExecutionResult {
  const points = definition.stages.reduce((sum, stage) => sum + stage.points, 0);
  return { id: "submission-1", verdict: "accepted", score: points, maxScore: points, durationMs: 100,
    cases: definition.stages.flatMap((stage) => ["visible", "hidden"].map((prefix) => ({ id: `${prefix}-${stage.number}`, name: `${prefix} ${stage.number}`, stage: stage.number, passed: true }))) };
}
const none = { kind: "none" };

describe("feedback de conclusão por resposta", () => {
  it.each(["typescript", "python"] as const)("conclui um envio oficial completo em %s", (runtime) => {
    expect(getSubmissionOutcome(problem(), context({ runtime }), accepted())).toEqual({ kind: "completed", passedCases: 8, stageCount: 4 });
  });

  it("conclui uma questão clássica sem exigir quatro estágios", () => {
    const classic = problem("classic");
    expect(getSubmissionOutcome(classic, context({ maxStage: 1 }), accepted(classic))).toEqual({ kind: "completed", passedCases: 2, stageCount: 1 });
  });

  it("não depende da ordem dos estágios ou casos e não altera as entradas", () => {
    const definition = problem(); definition.stages.reverse();
    const response = accepted(definition); response.cases.reverse();
    const request = context();
    const before = JSON.stringify([definition, request, response]);
    expect(getSubmissionOutcome(definition, request, response).kind).toBe("completed");
    expect(JSON.stringify([definition, request, response])).toBe(before);
  });

  it.each(["visible", "selected", "custom"] as const)("execução %s aprovada é só prática, mesmo cobrindo toda a questão", (scope) => {
    expect(getSubmissionOutcome(problem(), context({ kind: "run", scope }), accepted())).toEqual({ kind: "practice_passed", passedCases: 8, stageCount: 4 });
  });

  it("executar nunca vira conclusão, mesmo com scope official", () => {
    expect(getSubmissionOutcome(problem(), context({ kind: "run" }), accepted()).kind).toBe("practice_passed");
  });

  it("reconhece prática parcial aceita com pontuação do escopo executado", () => {
    const response = accepted(); response.cases = response.cases.filter((test) => test.stage <= 2); response.score = response.maxScore = 300;
    expect(getSubmissionOutcome(problem(), context({ kind: "run", scope: "visible", maxStage: 2 }), response)).toEqual({ kind: "practice_passed", passedCases: 4, stageCount: 2 });
    expect(getSubmissionOutcome(problem(), context({ maxStage: 2 }), response)).toEqual(none);
  });

  it.each(["visible", "selected", "custom"] as const)("submissão com scope %s não comprova conclusão nem prática", (scope) => {
    expect(getSubmissionOutcome(problem(), context({ scope }), accepted())).toEqual(none);
  });

  it.each(["wrong_answer", "compile_error", "runtime_error", "time_limit", "memory_limit", "output_limit", "system_error"] as const)("não comemora veredito %s, mesmo com pontuação/casos aparentando sucesso", (verdict) => {
    for (const kind of ["run", "submission"] as const) expect(getSubmissionOutcome(problem(), context({ kind }), { ...accepted(), verdict })).toEqual(none);
  });

  it.each([
    ["casos vazios", (response: ExecutionResult) => { response.cases = []; }],
    ["caso com falha", (response: ExecutionResult) => { response.cases[0]!.passed = false; }],
    ["id duplicado", (response: ExecutionResult) => { response.cases[1]!.id = response.cases[0]!.id; }],
    ["id de caso vazio", (response: ExecutionResult) => { response.cases[0]!.id = " "; }],
    ["id de resposta vazio", (response: ExecutionResult) => { response.id = ""; }],
    ["estágio faltando", (response: ExecutionResult) => { response.cases = response.cases.filter((test) => test.stage !== 3); }],
    ["estágio inesperado", (response: ExecutionResult) => { response.cases[0]!.stage = 5; }],
    ["estágio zero", (response: ExecutionResult) => { response.cases[0]!.stage = 0; }],
    ["estágio fracionado", (response: ExecutionResult) => { response.cases[0]!.stage = 1.5; }],
    ["mismatch em caso aprovado", (response: ExecutionResult) => { response.cases[0]!.mismatch = { expected: 1, actual: 2 }; }],
    ["pontuação parcial", (response: ExecutionResult) => { response.score = 450; }],
    ["máximo incorreto", (response: ExecutionResult) => { response.score = response.maxScore = 100; }],
    ["pontuação infinita", (response: ExecutionResult) => { response.score = response.maxScore = Infinity; }],
    ["pontuação negativa", (response: ExecutionResult) => { response.score = response.maxScore = -1; }],
    ["pontuação fracionada", (response: ExecutionResult) => { response.score = response.maxScore = 0.5; }],
    ["duração negativa", (response: ExecutionResult) => { response.durationMs = -1; }]
  ] as const)("falha fechada para resposta inconsistente: %s", (_name, mutate) => {
    const response = accepted(); mutate(response);
    expect(getSubmissionOutcome(problem(), context(), response)).toEqual(none);
    expect(getSubmissionOutcome(problem(), context({ kind: "run", scope: "custom" }), response)).toEqual(none);
  });

  it("rejeita respostas fora do limite capturado e linguagens indisponíveis", () => {
    expect(getSubmissionOutcome(problem(), context({ maxStage: 3 }), accepted())).toEqual(none);
    expect(getSubmissionOutcome(problem(), context({ maxStage: 5 }), accepted())).toEqual(none);
    expect(getSubmissionOutcome(problem(), context({ maxStage: 2.5 }), accepted())).toEqual(none);
    const definition = problem(); definition.runtimes = definition.runtimes.filter((runtime) => runtime.language !== "python");
    expect(getSubmissionOutcome(definition, context({ runtime: "python" }), accepted())).toEqual(none);
  });

  it("não soma submissões parciais distintas para inferir conclusão", () => {
    for (const stage of [1, 2, 3, 4]) {
      const response = accepted(); response.cases = response.cases.filter((test) => test.stage === stage); response.score = response.maxScore = 150;
      expect(getSubmissionOutcome(problem(), context(), response)).toEqual(none);
    }
  });

  it("exige cobertura até de um estágio sem pontos", () => {
    const definition = problem(); definition.stages[3]!.points = 0;
    const response = accepted(definition);
    expect(getSubmissionOutcome(definition, context(), response).kind).toBe("completed");
    response.cases = response.cases.filter((test) => test.stage !== 4);
    expect(getSubmissionOutcome(definition, context(), response)).toEqual(none);
  });

  it("recusa definição incoerente sem inferir conquistas ou persistência", () => {
    const duplicate = problem(); duplicate.stages[3]!.number = 1;
    expect(getSubmissionOutcome(duplicate, context(), accepted())).toEqual(none);
    const empty = problem(); empty.stages = [];
    expect(getSubmissionOutcome(empty, context(), accepted())).toEqual(none);
    expect(Object.keys(getSubmissionOutcome(problem(), context(), accepted())).sort()).toEqual(["kind", "passedCases", "stageCount"]);
  });
});
