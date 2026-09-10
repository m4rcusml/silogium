import { z } from "zod";
import { ExecutionRequestSchema, JudgeCaseSchema, type ExecutionResult, type JudgeBundle, type ProblemDefinition } from "./schemas.js";

export const ExecutionApiRequestSchema = ExecutionRequestSchema.extend({
  accessKey: z.string().max(512).optional(),
  visibleCaseIds: z.array(z.string().min(1).max(200)).min(1).max(20).optional(),
  customCases: z.array(JudgeCaseSchema).min(1).max(10).optional()
}).superRefine((input, context) => {
  if (input.kind !== "run" && (input.visibleCaseIds !== undefined || input.customCases !== undefined)) {
    context.addIssue({ code: "custom", message: "Testes personalizados e seleção de casos estão disponíveis apenas em Executar." });
  }
  if (input.customCases && new TextEncoder().encode(JSON.stringify(input.customCases)).byteLength > 32_768) {
    context.addIssue({ code: "custom", path: ["customCases"], message: "Os testes personalizados devem ocupar no máximo 32 KiB." });
  }
  if (input.customCases?.some((test) => test.kind === "call-sequence" && test.calls.some((call) => !Object.hasOwn(call, "expected")))) {
    context.addIssue({ code: "custom", path: ["customCases"], message: "Cada chamada precisa de um resultado esperado; use null para ausência de valor." });
  }
});
export type ExecutionApiRequest = z.infer<typeof ExecutionApiRequestSchema>;

/** Select practice fixtures without ever mutating the official test suite. */
export function prepareExecutionBundle(problem: ProblemDefinition, bundle: JudgeBundle, input: ExecutionApiRequest): JudgeBundle {
  if (input.kind === "submission") {
    if (input.visibleCaseIds !== undefined || input.customCases !== undefined) throw new Error("Uma submissão usa somente os testes oficiais.");
    return { ...bundle, referenceSolutions: {} };
  }

  const visibleById = new Map(bundle.visibleCases.map((test) => [test.id, test]));
  const selected = input.visibleCaseIds?.map((id) => {
    const test = visibleById.get(id);
    if (!test || (input.maxStage !== undefined && test.stage > input.maxStage)) throw new Error("Teste visível não encontrado neste nível.");
    return test;
  }) ?? (input.customCases ? [] : bundle.visibleCases);
  const custom = input.customCases ?? [];
  const stages = new Set(problem.stages.map((stage) => stage.number));
  for (const test of custom) {
    if (test.kind !== problem.executionModel) throw new Error("O formato do teste personalizado não corresponde à questão.");
    if (!stages.has(test.stage) || (input.maxStage !== undefined && test.stage > input.maxStage)) throw new Error("Nível inválido no teste personalizado.");
    if (test.kind === "call-sequence" && test.calls.length > 100) throw new Error("Cada teste personalizado permite até 100 chamadas.");
  }
  const visibleCases = [...selected, ...custom].filter((test) => !input.maxStage || test.stage <= input.maxStage);
  if (!visibleCases.length) throw new Error("Selecione pelo menos um teste para executar.");
  if (new Set(visibleCases.map((test) => test.id)).size !== visibleCases.length) throw new Error("Os testes selecionados precisam ter identificadores únicos.");
  return { ...bundle, visibleCases, hiddenCases: [], referenceSolutions: {} };
}

/** Apply again at the API boundary, including results from a remote judge. */
export function sanitizeExecutionResult(result: ExecutionResult, bundle: JudgeBundle, kind: "run" | "submission"): ExecutionResult {
  if (kind === "run") return result;
  const visibleIds = new Set(bundle.visibleCases.map((test) => test.id));
  const hiddenIds = new Set(bundle.hiddenCases.map((test) => test.id));
  const cases = result.cases.map((outcome) => {
    if (visibleIds.has(outcome.id) && !hiddenIds.has(outcome.id)) return outcome;
    return { id: outcome.id, stage: outcome.stage, passed: outcome.passed, name: "Teste oculto" };
  });
  const privateFailure = bundle.hiddenCases.length > 0 && ["runtime_error", "compile_error", "system_error"].includes(result.verdict);
  return { ...result, cases, ...(privateFailure ? { message: "A execução falhou. Execute os testes visíveis para obter detalhes." } : {}) };
}
