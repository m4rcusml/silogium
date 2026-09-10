import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectPractice, seedProblems, type ExecutionRequest, type ExecutionResult, type JudgeBundle } from "../src/index.js";
import { executionEvidence } from "../../../apps/web/lib/durable-progress.js";
import { getExecution, listExecutionPage, loadPracticeHistory, saveExecution } from "../../../apps/web/lib/executions.js";
import { advancePracticeSettings, getPracticeOverview, getPracticeSettings, updatePracticeSettings } from "../../../apps/web/lib/practice-repository.js";

vi.mock("../../../apps/web/lib/supabase/admin.js", () => ({ createSupabaseAdminClient: () => null }));
const actor = { id: "alice", handle: "alice", role: "user" as const };
const problem = seedProblems[0]!;
const request: ExecutionRequest = { kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime: "typescript", source: "export class Solution {}" };
const fixtures: JudgeBundle = { schemaVersion: 1, problemId: problem.id, problemVersion: problem.version, referenceSolutions: {}, visibleCases: [],
  hiddenCases: problem.stages.map((stage) => ({ kind: "call-sequence", id: `hidden-${stage.number}`, stage: stage.number, name: "secret case", constructorArgs: [], calls: [{ method: "foo", args: [], expected: "secret expected" }] })) };
function result(id = "submission-1"): ExecutionResult { return { id, verdict: "accepted", score: 600, maxScore: 600, durationMs: 50, cases: fixtures.hiddenCases.map((test) => ({ id: test.id, stage: test.stage, name: "Teste oculto", passed: true })) }; }
function verified(id = "submission-1") { return executionEvidence({ actor, problem, bundle: fixtures, request, result: result(id), persistent: true, trustedJudgePolicy: "reviewed-v1", occurredAt: "2026-09-09T12:00:00.000Z" }); }

beforeEach(() => {
  const state = globalThis as typeof globalThis & { __silogiumExecutions?: Map<string, unknown>; __silogiumPracticeSettings?: Map<string, unknown> };
  state.__silogiumExecutions?.clear(); state.__silogiumPracticeSettings?.clear();
});

describe("evidência construída no servidor", () => {
  it("comprova todos os casos esperados sem carregar respostas ou nomes ocultos no evento", () => {
    const evidence = verified();
    expect(projectPractice({ userId: actor.id, evidence: [evidence], historyComplete: true }).summary.distinctProblems).toBe(1);
    expect(JSON.stringify(evidence)).not.toMatch(/secret expected|secret case|export class/);
  });
  it.each(["missing", "duplicate", "unknown", "wrong-stage"])("accepted com resultado %s não confirma a solução", (mode) => {
    const output = result();
    if (mode === "missing") output.cases.pop();
    if (mode === "duplicate") output.cases.push({ ...output.cases[0]! });
    if (mode === "unknown") output.cases.push({ id: "unknown", name: "forged", passed: true, stage: 1 });
    if (mode === "wrong-stage") output.cases[0]!.stage = 999;
    const evidence = executionEvidence({ actor, problem, bundle: fixtures, request, result: output, persistent: true, trustedJudgePolicy: "trusted" });
    expect(projectPractice({ userId: actor.id, evidence: [evidence], historyComplete: true }).summary.distinctProblems).toBe(0);
  });
  it("não premia demo, judge sem confiança explícita ou bundle só público", () => {
    const entries = [
      executionEvidence({ actor, problem, bundle: fixtures, request, result: result("demo"), persistent: false, trustedJudgePolicy: "ignored" }),
      executionEvidence({ actor, problem, bundle: fixtures, request, result: result("untrusted"), persistent: true }),
      executionEvidence({ actor, problem, bundle: { ...fixtures, visibleCases: fixtures.hiddenCases, hiddenCases: [] }, request, result: result("public-only"), persistent: true, trustedJudgePolicy: "trusted" })
    ];
    expect(projectPractice({ userId: actor.id, evidence: entries, historyComplete: true }).achievements).toEqual([]);
  });
  it("preserva corte de estágio e não inventa identidades estáveis para revisões", () => {
    const partial = executionEvidence({ actor, problem, bundle: fixtures, request: { ...request, maxStage: 1 }, result: { ...result(), cases: result().cases.slice(0, 1) }, persistent: true, trustedJudgePolicy: "trusted" });
    expect(partial.verification).toMatchObject({ kind: "official", scope: "partial" });
    const old = verified();
    const revised = executionEvidence({ actor, problem: { ...problem, version: 2 }, bundle: { ...fixtures, problemVersion: 2 }, request: { ...request, problemVersion: 2 }, result: result("revision"), persistent: true, trustedJudgePolicy: "trusted" });
    const projection = projectPractice({ userId: actor.id, evidence: [old, revised], historyComplete: true });
    expect(projection.summary.distinctProblems).toBe(1);
    expect(projection.completions).toHaveLength(2);
    expect(projection.milestones.filter((item) => item.kind === "stage_completed")).toHaveLength(problem.stages.length);
  });
});

describe("histórico completo e privado", () => {
  it("pagina acima de 100 com empate de horário e guarda código/maxStage só nos detalhes", async () => {
    for (let index = 0; index < 153; index++) {
      const id = `submission-${index.toString().padStart(3, "0")}`;
      const source = `${request.source}\n// ${index}`;
      const input = { ...request, source, maxStage: 1 };
      await saveExecution(actor.id, input, result(id), verified(id));
    }
    const first = await listExecutionPage(actor.id, { limit: 50 });
    const second = await listExecutionPage(actor.id, { limit: 50, cursor: first.nextCursor! });
    const third = await listExecutionPage(actor.id, { limit: 100, cursor: second.nextCursor! });
    expect(first.total).toBe(153);
    expect(third.nextCursor).toBeNull();
    expect(new Set([...first.executions, ...second.executions, ...third.executions].map((item) => item.result.id)).size).toBe(153);
    expect(JSON.stringify(first)).not.toContain("export class");
    expect(first.executions[0]!.request.maxStage).toBe(1);
    expect(await getExecution(actor.id, first.executions[0]!.result.id)).toMatchObject({ source: expect.stringContaining("export class"), codeAvailable: true });
    expect(await loadPracticeHistory(actor.id)).toHaveLength(153);
    expect(JSON.stringify(await loadPracticeHistory(actor.id))).not.toContain("export class");
  });
  it("é idempotente e não permite acesso cruzado ou reutilização de ID com outro conteúdo", async () => {
    await Promise.all([saveExecution(actor.id, request, result(), verified()), saveExecution(actor.id, request, result(), verified())]);
    expect((await listExecutionPage(actor.id)).total).toBe(1);
    expect(await getExecution("bob", result().id)).toBeNull();
    expect((await listExecutionPage("bob")).executions).toEqual([]);
    await expect(saveExecution("bob", request, result())).rejects.toThrow("Identificador");
    await expect(saveExecution(actor.id, { ...request, source: "changed" }, result(), verified())).rejects.toThrow("Identificador");
  });
  it("filtra o histórico inteiro e recusa cursor/limites inválidos", async () => {
    await saveExecution(actor.id, request, result("one"));
    await saveExecution(actor.id, { ...request, kind: "run" }, { ...result("two"), verdict: "wrong_answer" });
    expect((await listExecutionPage(actor.id, { kind: "run", outcome: "failed" })).total).toBe(1);
    await expect(listExecutionPage(actor.id, { cursor: "forged" })).rejects.toThrow("Cursor");
    await expect(listExecutionPage(actor.id, { limit: 101 })).rejects.toThrow("página");
    await expect(listExecutionPage(actor.id, { problemVersion: NaN })).rejects.toThrow("Versão");
  });
  it("histórico legado continua visível sem código inventado nem conquista", async () => {
    const state = globalThis as typeof globalThis & { __silogiumExecutions: Map<string, unknown> };
    state.__silogiumExecutions.set("legacy", { actorId: actor.id, request: { ...request, source: undefined }, result: result("legacy"), createdAt: "2026-09-08T12:00:00.000Z" });
    expect(await getExecution(actor.id, "legacy")).toMatchObject({ codeAvailable: false, verification: "legacy_unverified" });
    const overview = await getPracticeOverview(actor.id);
    expect(overview.mode).toBe("demo"); expect(overview.historyScope).toBe("session");
    expect(overview.activity.acceptedSubmissions).toBe(1);
    expect(overview.catalogProgress).toMatchObject([{ problemId: problem.id, problemVersion: problem.version, submissions: [{ accepted: true }] }]);
    expect(overview.summary.distinctProblems).toBe(0); expect(overview.achievements).toEqual([]);
    expect(overview.unverifiedSubmissions).toBe(1);
  });
});

describe("preferências semanais persistíveis", () => {
  it("primeiro opt-in não reconta a semana em andamento", async () => {
    const stored = await updatePracticeSettings(actor.id, { timeZone: "America/Sao_Paulo", goalDays: 3, showProgress: true }, "2026-09-09T12:00:00Z");
    expect(stored.weeks[0]?.goalDays).toBeNull();
    expect(stored.pending?.preferences.goalDays).toBe(3);
    const active = await getPracticeSettings(actor.id, "2026-09-14T04:00:00Z");
    expect(active.weeks.at(-1)?.goalDays).toBe(3);
    expect(active.pending).toBeUndefined();
  });
  it("troca de fuso preserva horas na semana anterior sem dupla contagem", async () => {
    const stored = await updatePracticeSettings(actor.id, { timeZone: "UTC", goalDays: 3, showProgress: true }, "2026-09-09T12:00:00Z");
    const advanced = advancePracticeSettings(actor.id, stored, "2026-09-14T04:00:00Z");
    expect(advanced.weeks[0]?.endsAt).toBe("2026-09-14T03:00:00.000Z");
    expect(advanced.weeks[1]).toMatchObject({ startsAt: "2026-09-14T00:00:00.000Z", countFrom: "2026-09-14T03:00:00.000Z", timeZone: "UTC" });
  });
  it("preferências de outro usuário não alteram a conta e ocultar não apaga história", async () => {
    await saveExecution(actor.id, request, result());
    await updatePracticeSettings("bob", { timeZone: "UTC", goalDays: 7, showProgress: false });
    expect((await getPracticeSettings(actor.id)).showProgress).toBe(true);
    await updatePracticeSettings(actor.id, { timeZone: "America/Sao_Paulo", goalDays: null, showProgress: false });
    expect((await getPracticeOverview(actor.id)).activity.submissions).toBe(1);
    expect((await getPracticeSettings(actor.id)).showProgress).toBe(false);
  });
});
