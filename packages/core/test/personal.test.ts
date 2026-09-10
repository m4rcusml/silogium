import { describe, expect, it } from "vitest";
import { CommunityPostSchema, PersonalActionSchema, PersonalProfileSchema, SolutionSnapshotSchema, emptyPersonalState, recommendPractice, updatePersonalState } from "../src/personal.js";
import { seedProblems } from "../src/index.js";

const problem = seedProblems[0]!;
const nextId = "00000000-0000-4000-8000-000000000091";
const options = { now: new Date("2026-09-09T12:00:00Z"), newId: nextId, accessible: new Map(seedProblems.map((item) => [item.id, item])) };
describe("biblioteca e perfil", () => {
  it("começa privado e não altera o estado anterior", () => {
    const previous = emptyPersonalState("ana");
    const next = updatePersonalState(previous, { kind: "favorite", problemId: problem.id, saved: true }, options);
    expect(previous.favorites).toEqual([]); expect(next.favorites).toEqual([problem.id]); expect(next.profile.shared).toBe(false); expect(next.revision).toBe(1);
  });
  it("favoritar novamente não duplica e remover não apaga questão", () => {
    let state = emptyPersonalState("ana");
    for (let index = 0; index < 2; index++) state = updatePersonalState(state, { kind: "favorite", problemId: problem.id, saved: true }, options);
    expect(state.favorites).toEqual([problem.id]);
    state = updatePersonalState(state, { kind: "favorite", problemId: problem.id, saved: false }, options);
    expect(state.favorites).toEqual([]); expect(options.accessible.has(problem.id)).toBe(true);
  });
  it("não permite favoritar/listar questão inacessível", () => {
    expect(() => updatePersonalState(emptyPersonalState("a"), { kind: "favorite", problemId: nextId, saved: true }, options)).toThrow(/indisponível/);
    expect(() => updatePersonalState(emptyPersonalState("a"), { kind: "save_list", title: "X", listKind: "track", problemIds: [nextId] }, options)).toThrow(/indisponível/);
  });
  it("preserva ordem e identidade da trilha ao editar", () => {
    let state = updatePersonalState(emptyPersonalState("a"), { kind: "save_list", title: "Estudo", listKind: "track", problemIds: seedProblems.map((item) => item.id) }, options);
    state = updatePersonalState(state, { kind: "save_list", id: nextId, title: "Meu estudo", listKind: "track", problemIds: [...seedProblems].reverse().map((item) => item.id) }, options);
    expect(state.lists).toHaveLength(1); expect(state.lists[0]!.problemIds[0]).toBe(seedProblems.at(-1)!.id);
    expect(() => updatePersonalState(state, { kind: "save_list", id: problem.id, title: "X", listKind: "list", problemIds: [] }, options)).toThrow(/não encontrada/);
  });
  it("valida quantidades, duplicidade e URLs seguras", () => {
    expect(PersonalActionSchema.safeParse({ kind: "save_list", title: "X", listKind: "list", problemIds: [problem.id, problem.id] }).success).toBe(false);
    expect(PersonalProfileSchema.safeParse({ displayName: "A", bio: "", website: "javascript:alert(1)", shared: true }).success).toBe(false);
    expect(PersonalProfileSchema.safeParse({ displayName: "A", bio: "", website: "https://example.org", shared: false }).success).toBe(true);
    expect(CommunityPostSchema.safeParse({ kind: "solution", title: "Solução", body: "Uma explicação", status: "approved", authorId: "fake" }).data).not.toHaveProperty("status");
  });
});
describe("simulado de prática", () => {
  it("preserva mais de 20 simulados e comunica o limite sem descartar históricos", () => {
    let state = emptyPersonalState("ana");
    for (let index = 0; index < 100; index++) {
      state = updatePersonalState(state, { kind: "start_simulation", title: `Treino ${index}`, problemIds: [problem.id], minutes: 5 }, { ...options, newId: String(index) });
      state = updatePersonalState(state, { kind: "finish_simulation", id: String(index) }, options);
    }
    expect(state.simulations).toHaveLength(100);
    expect(state.simulations[0]!.title).toBe("Treino 0");
    expect(() => updatePersonalState(state, { kind: "start_simulation", title: "Mais um", problemIds: [problem.id], minutes: 5 }, options)).toThrow(/histórico foi preservado/);
  });
  it("fixa versão e prazo no servidor, impede sessões simultâneas", () => {
    const state = updatePersonalState(emptyPersonalState("a"), { kind: "start_simulation", title: "Treino", problemIds: [problem.id], minutes: 60 }, options);
    expect(state.simulations[0]).toMatchObject({ versions: { [problem.id]: problem.version }, endsAt: "2026-09-09T13:00:00.000Z" });
    expect(() => updatePersonalState(state, { kind: "start_simulation", title: "Outra", problemIds: [problem.id], minutes: 10 }, options)).toThrow(/Finalize/);
    const ended = updatePersonalState(state, { kind: "finish_simulation", id: nextId }, { ...options, now: new Date("2026-09-09T13:30:00Z") });
    expect(ended.simulations[0]!.finishedAt).toBe("2026-09-09T13:00:00.000Z");
  });
});
describe("sugestões pessoais", () => {
  it("não recomenda concluídas e prioriza retomada sem alegar proficiência", () => {
    const recommendations = recommendPractice(seedProblems, [{ problemId: seedProblems[0]!.id, accepted: true }, { problemId: seedProblems[1]!.id, accepted: false }]);
    expect(recommendations.some((item) => item.problem.id === seedProblems[0]!.id)).toBe(false);
    expect(recommendations[0]!.problem.id).toBe(seedProblems[1]!.id); expect(recommendations[0]!.reason).toContain("Retome");
  });
  it("rascunhos vazios são válidos e dados desconhecidos não entram no snapshot", () => {
    const result = SolutionSnapshotSchema.parse({ source: "", preferences: { fontSize: 14, wordWrap: true, split: 42, resultHeight: 34, customTests: "" }, token: "do-not-save" });
    expect(result.source).toBe(""); expect(result).not.toHaveProperty("token");
  });
});
