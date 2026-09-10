import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedProblems } from "../src/index.js";
const mocks = vi.hoisted(() => ({ history: vi.fn(), personal: vi.fn(), catalog: vi.fn(), version: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: async () => ({ id: "alice", handle: "alice", role: "user" }) }));
vi.mock("@/lib/authoring", () => ({ getAuthoringRepository: () => ({ listCatalog: mocks.catalog, getPackageVersion: mocks.version }) }));
vi.mock("@/lib/executions", () => ({ loadPracticeHistory: mocks.history }));
vi.mock("@/lib/personal", () => ({ readPersonal: mocks.personal }));
vi.mock("@/lib/catalog-progress", async () => import("../../../apps/web/lib/catalog-progress.js"));
const simPath = "../../../apps/web/app/api/v1/personal/simulations/route.ts";
const recPath = "../../../apps/web/app/api/v1/personal/recommendations/route.ts";
const { GET: simulations } = await import(simPath);
const { GET: recommendations } = await import(recPath);
const problem = seedProblems[0]!;
const request = new Request("http://silogium.test/api/v1/personal/simulations");
function execution(id: string, stages: number[], verdict = "accepted", version = problem.version) {
  return { createdAt: "2026-09-09T12:00:00Z", request: { problemId: problem.id, problemVersion: version, kind: "submission", runtime: "typescript" }, result: { id, verdict, score: 600, maxScore: 600, cases: stages.map((stage) => ({ id: `case${stage}`, stage, passed: true })) } };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalog.mockResolvedValue([problem]);
  mocks.version.mockResolvedValue({ problem });
  mocks.personal.mockResolvedValue({ simulations: [{ id: "sim", title: "Treino", problemIds: [problem.id], versions: { [problem.id]: problem.version }, startedAt: "2026-09-09T11:00:00Z", endsAt: "2026-09-09T13:00:00Z" }] });
});
describe("conclusão completa nos simulados e recomendações", () => {
  it("aceitações parciais não viram conclusão nem somando envios", async () => {
    mocks.history.mockResolvedValue(problem.stages.map((stage) => execution(String(stage.number), [stage.number])));
    const body = await (await simulations(request)).json();
    expect(body.simulations[0]).toMatchObject({ completed: 0, attempts: problem.stages.length });
    expect((await (await recommendations(request)).json()).recommendations[0]).toMatchObject({ id: problem.id, reason: expect.stringContaining("Retome") });
  });
  it("somente uma submissão completa aceita conclui e deixa de sugerir", async () => {
    mocks.history.mockResolvedValue([execution("complete", problem.stages.map((stage) => stage.number)), execution("infra", [], "system_error")]);
    expect((await (await simulations(request)).json()).simulations[0]).toMatchObject({ completed: 1, attempts: 1 });
    expect((await (await recommendations(request)).json()).recommendations).toEqual([]);
    expect(mocks.version).toHaveBeenCalledWith(problem.id, problem.version, expect.objectContaining({ id: "alice" }));
  });
  it("não conta outra versão, fora do prazo ou questão inacessível", async () => {
    mocks.history.mockResolvedValue([execution("other", [1, 2, 3, 4], "accepted", problem.version + 1), { ...execution("late", [1, 2, 3, 4]), createdAt: "2026-09-09T14:00:00Z" }]);
    expect((await (await simulations(request)).json()).simulations[0]).toMatchObject({ completed: 0, attempts: 0 });
    mocks.history.mockResolvedValue([execution("complete", [1, 2, 3, 4])]);
    mocks.version.mockResolvedValue(null);
    expect((await (await simulations(request)).json()).simulations[0].completed).toBe(0);
  });
});
