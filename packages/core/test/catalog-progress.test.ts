import { describe, expect, it } from "vitest";
import { seedProblems, type ExecutionRequest, type ExecutionResult } from "../src/index.js";
import { catalogProgressForProblem, summarizeCatalogProgress } from "../../../apps/web/lib/catalog-progress.js";

const problem = seedProblems[0]!;
const stages = problem.stages.map((stage) => stage.number);
function activity(id: string, options: { stages?: number[]; kind?: "run" | "submission"; version?: number; verdict?: ExecutionResult["verdict"]; score?: number; runtime?: ExecutionRequest["runtime"] } = {}) {
  return { request: { problemId: problem.id, problemVersion: options.version ?? problem.version, kind: options.kind ?? "submission", runtime: options.runtime ?? "typescript", source: "private source" },
    result: { id, verdict: options.verdict ?? "accepted", score: options.score ?? 600, maxScore: 600, cases: (options.stages ?? stages).map((stage) => ({ id: `secret-${stage}`, name: "secret name", stage, passed: true, message: "secret details" })) } };
}
describe("progresso pessoal completo do catálogo", () => {
  it("preserva uma solução anterior às últimas 100 execuções sem enviar código ou detalhes", () => {
    const history = [...Array.from({ length: 153 }, (_, index) => activity(`run-${index}`, { kind: "run" })), activity("old-accepted")];
    const recent = summarizeCatalogProgress(history.slice(0, 100));
    expect(catalogProgressForProblem(problem, recent).status).toBe("in_progress");
    const full = summarizeCatalogProgress(history);
    expect(catalogProgressForProblem(problem, full)).toEqual({ status: "solved", best: { score: 600, maxScore: 600 } });
    expect(full).toHaveLength(1);
    expect(JSON.stringify(full)).not.toMatch(/source|secret|accepted-id|runtime/);
  });
  it("não junta submissões parciais nem aceita runs como solução completa", () => {
    const summaries = summarizeCatalogProgress([activity("run", { kind: "run" }), ...stages.map((stage) => activity(`partial-${stage}`, { stages: [stage] }))]);
    expect(catalogProgressForProblem(problem, summaries)).toEqual({ status: "in_progress" });
  });
  it("isola versões, exclui infraestrutura e considera qualquer linguagem para prática", () => {
    const old = summarizeCatalogProgress([activity("old", { version: problem.version + 1 }), activity("infra", { verdict: "system_error" })]);
    expect(catalogProgressForProblem(problem, old)).toEqual({ status: "not_started" });
    expect(catalogProgressForProblem(problem, summarizeCatalogProgress([activity("python", { runtime: "python" })])).status).toBe("solved");
  });
  it("deduplica replays e mantém a melhor pontuação sem rebaixar solução anterior", () => {
    const accepted = activity("one");
    const summary = summarizeCatalogProgress([accepted, accepted, activity("lower", { verdict: "wrong_answer", score: 150 })]);
    expect(summary[0]?.submissions).toHaveLength(1);
    expect(catalogProgressForProblem(problem, summary)).toEqual({ status: "solved", best: { score: 600, maxScore: 600 } });
  });
});
