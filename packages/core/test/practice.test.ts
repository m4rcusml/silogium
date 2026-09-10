import { describe, expect, it } from "vitest";
import { ExecutionApiRequestSchema, ExecutionRequestSchema, prepareExecutionBundle, sanitizeExecutionResult, seedProblems, type ExecutionResult, type JudgeBundle, type JudgeCase } from "../src/index.js";

const problem = seedProblems[0]!;
const visible: JudgeCase = { kind: "call-sequence", id: "visible", name: "Público", stage: 1, constructorArgs: [], calls: [{ method: "add", args: [1], expected: 1 }] };
const hidden: JudgeCase = { ...visible, id: "hidden", name: "Segredo 93817" };
const custom: JudgeCase = { ...visible, id: "custom", name: "Meu teste" };
const bundle: JudgeBundle = { schemaVersion: 1, problemId: problem.id, problemVersion: problem.version, visibleCases: [visible], hiddenCases: [hidden], referenceSolutions: { typescript: "REFERÊNCIA PRIVADA" } };
const request = { kind: "run" as const, problemId: problem.id, problemVersion: problem.version, runtime: "typescript" as const, source: "export class Solution {}" };

describe("seleção segura de testes de prática", () => {
  it("não altera a suíte oficial e remove testes ocultos e referências antes de executar", () => {
    const before = structuredClone(bundle);
    const selected = prepareExecutionBundle(problem, bundle, { ...request, customCases: [custom] });
    expect(selected.visibleCases).toEqual([custom]);
    expect(selected.hiddenCases).toEqual([]);
    expect(selected.referenceSolutions).toEqual({});
    expect(bundle).toEqual(before);
    const official = prepareExecutionBundle(problem, bundle, { ...request, kind: "submission" });
    expect(official.visibleCases).toEqual([visible]);
    expect(official.hiddenCases).toEqual([hidden]);
  });

  it("combina casos visíveis selecionados com testes personalizados", () => {
    const selected = prepareExecutionBundle(problem, bundle, { ...request, visibleCaseIds: [visible.id], customCases: [custom] });
    expect(selected.visibleCases.map((test) => test.id)).toEqual(["visible", "custom"]);
    expect(ExecutionRequestSchema.parse({ ...request, customCases: [custom] })).not.toHaveProperty("customCases");
  });

  it("recusa seleção oculta, duplicados, formato e nível incompatíveis", () => {
    expect(() => prepareExecutionBundle(problem, bundle, { ...request, visibleCaseIds: [hidden.id] })).toThrow("Teste visível");
    expect(() => prepareExecutionBundle(problem, bundle, { ...request, visibleCaseIds: [visible.id, visible.id] })).toThrow("únicos");
    expect(() => prepareExecutionBundle(problem, bundle, { ...request, customCases: [{ ...custom, stage: 99 }] })).toThrow("Nível inválido");
    expect(() => prepareExecutionBundle(problem, bundle, { ...request, customCases: [{ kind: "stdio", id: "custom", name: "Errado", stage: 1, stdin: "", expectedStdout: "" }] })).toThrow("formato");
  });

  it("rejeita opções de prática numa submissão antes de consumir cota ou chamar o judge", () => {
    for (const options of [{ visibleCaseIds: [visible.id] }, { customCases: [custom] }]) {
      expect(ExecutionApiRequestSchema.safeParse({ ...request, kind: "submission", ...options }).success).toBe(false);
      expect(() => prepareExecutionBundle(problem, bundle, { ...request, kind: "submission", ...options })).toThrow("oficiais");
    }
  });

  it("valida estrutura e limita quantidade, tamanho e chamadas dos casos personalizados", () => {
    expect(ExecutionApiRequestSchema.safeParse({ ...request, customCases: [{}] }).success).toBe(false);
    expect(ExecutionApiRequestSchema.safeParse({ ...request, customCases: Array(11).fill(custom) }).success).toBe(false);
    expect(ExecutionApiRequestSchema.safeParse({ ...request, customCases: [{ ...custom, name: "á".repeat(16_384) }] }).success).toBe(false);
    const tooManyCalls = { ...custom, calls: Array(101).fill({ method: "add", args: [1], expected: 1 }) };
    expect(() => prepareExecutionBundle(problem, bundle, { ...request, customCases: [tooManyCalls] })).toThrow("100 chamadas");
  });
});

describe("feedback público do judge", () => {
  const result: ExecutionResult = {
    id: "result", verdict: "wrong_answer", score: 0, maxScore: 150, durationMs: 5,
    cases: [visible, hidden].map((test) => ({ id: test.id, name: test.name, stage: test.stage, passed: false, message: "93817", mismatch: { expected: 93817, actual: 0, input: [93817], method: "add" } }))
  };

  it("mantém detalhes visíveis e elimina nomes, mensagens e diffs ocultos mesmo se o caso passou", () => {
    for (const passed of [true, false]) {
      const sanitized = sanitizeExecutionResult({ ...result, cases: result.cases.map((test) => ({ ...test, passed })) }, bundle, "submission");
      expect(sanitized.cases[0]?.mismatch).toEqual(result.cases[0]?.mismatch);
      expect(sanitized.cases[1]).toEqual({ id: "hidden", name: "Teste oculto", stage: 1, passed });
    }
  });

  it("suprime saída livre que pode conter entradas ocultas em erros de execução", () => {
    const sanitized = sanitizeExecutionResult({ ...result, verdict: "runtime_error", cases: [], message: "segredo 93817" }, bundle, "submission");
    expect(sanitized.message).not.toContain("93817");
  });
});
