import { describe, expect, it } from "vitest";
import { freezePracticeWeek, projectPractice, summarizePracticeWeeks, type PracticeEvidence, type PracticePreferences } from "../src/index.js";

function evidence(overrides: Partial<PracticeEvidence> = {}): PracticeEvidence {
  return {
    submissionId: "submission-1", userId: "alice", problemId: "problem-1", canonicalProblemId: "canonical-1",
    problemVersion: 1, runtime: "typescript", occurredAt: "2026-09-09T12:00:00.000Z", kind: "submission", verdict: "accepted", purpose: "practice",
    problem: { format: "classic", origin: "native", visibility: "public", catalogReviewed: true, authorId: "author" },
    verification: { kind: "official", judgePolicyVersion: "judge-v1", bundleRevision: "sha256:v1", bundleComplete: true, bundleReviewed: true,
      scope: "complete", requiredStages: [1], stages: [{ number: 1, passed: true, fullyEvaluated: true, unitId: "foundation" }] },
    ...overrides
  };
}

function official(overrides: Partial<Extract<PracticeEvidence["verification"], { kind: "official" }>> = {}) {
  return { ...evidence().verification as Extract<PracticeEvidence["verification"], { kind: "official" }>, ...overrides };
}

function progressive(overrides: Partial<PracticeEvidence> = {}): PracticeEvidence {
  return evidence({
    problem: { ...evidence().problem, format: "progressive" },
    verification: official({ requiredStages: [1, 2, 3, 4], stages: [1, 2, 3, 4].map((number) => ({ number, unitId: `skill-${number}`, fullyEvaluated: true, passed: true })) }),
    ...overrides
  });
}

function project(items: PracticeEvidence[], historyComplete = true) {
  return projectPractice({ userId: "alice", evidence: items, historyComplete });
}

function week(at = "2026-09-09T12:00:00.000Z", preferences: PracticePreferences = { timeZone: "America/Sao_Paulo", goalDays: 3 }) {
  return freezePracticeWeek({ userId: "alice", at, preferences });
}

describe("projeção de prática verificada", () => {
  it.each(["same_delivery", "concurrent_submissions", "out_of_order"] as const)("deduplica marcos em %s sem depender da ordem", (scenario) => {
    const first = evidence();
    const other = scenario === "same_delivery" ? structuredClone(first) : evidence({ submissionId: "submission-2" });
    const items = scenario === "out_of_order" ? [other, first] : [first, other];
    const projection = project(items);
    expect(projection).toEqual(project([...items].reverse()));
    expect(projection.summary.distinctProblems).toBe(1);
    expect(projection.completions).toHaveLength(1);
    expect(projection.milestones).toHaveLength(1);
    expect(projection.achievements.map((item) => item.id)).toEqual(["first_solution"]);
    expect(projection.milestones[0]?.submissionId).toBe("submission-1");
  });

  it("rejeita evidência conflitante em replay, sem escolher um veredito arbitrário", () => {
    expect(() => project([evidence(), evidence({ verdict: "wrong_answer" })])).toThrow("conflitantes");
  });

  it("projeta mais de 100 submissões e preserva resultados após serialização/replay", () => {
    const items = Array.from({ length: 150 }, (_, index) => evidence({ submissionId: `s${index}`, problemId: `p${index}`, canonicalProblemId: `c${index}` }));
    const projection = project(items);
    expect(projection.summary.distinctProblems).toBe(150);
    expect(projection.summary.byRuntime.typescript).toBe(150);
    expect(projection.achievements.map((item) => item.id)).toContain("five_catalog_problems");
    expect(project(JSON.parse(JSON.stringify([...items, ...items])))).toEqual(projection);
  });

  it("separa linguagens sem duplicar o total de questões ou conquistas", () => {
    const projection = project([evidence(), evidence({ submissionId: "s2", runtime: "python" })]);
    expect(projection.summary).toEqual({ distinctProblems: 1, byRuntime: { typescript: 1, python: 1 } });
    expect(projection.achievements.map((item) => item.id)).toEqual(["first_solution", "two_languages"]);
  });

  it("preserva evidência de versões antigas sem renovar marcos com nova política/versão", () => {
    const old = progressive();
    const revised = progressive({ submissionId: "s2", problemVersion: 2, occurredAt: "2026-09-10T12:00:00Z",
      verification: official({ judgePolicyVersion: "judge-v2", bundleRevision: "sha256:v2", requiredStages: [11, 12, 13, 14],
        stages: [11, 12, 13, 14].map((number) => ({ number, unitId: `skill-${number - 10}`, passed: true, fullyEvaluated: true })) }) });
    const projection = project([old, revised]);
    expect(projection.completions.map((item) => item.problemVersion)).toEqual([1, 2]);
    expect(projection.milestones).toHaveLength(5);
    expect(projection.milestones.every((item) => item.problemVersion === 1 && item.judgePolicyVersion === "judge-v1")).toBe(true);
    expect(projection.summary.distinctProblems).toBe(1);
    expect(projection.achievements.map((item) => item.id)).toEqual(["first_solution", "step_by_step"]);
  });

  it("não inventa marcos de estágio sem identidade estável, mas reconhece a conclusão completa", () => {
    const value = progressive();
    value.verification = official({ requiredStages: [1, 2], stages: [1, 2].map((number) => ({ number, passed: true, fullyEvaluated: true })) });
    expect(project([value]).milestones.map((item) => item.kind)).toEqual(["problem_completed"]);
  });

  it("duas soluções parciais incompatíveis não concluem uma progressiva", () => {
    const partial = (number: number) => progressive({ submissionId: `partial-${number}`, verification: official({ scope: "partial", requiredStages: [1, 2], stages: [{ number, unitId: `skill-${number}`, passed: true, fullyEvaluated: true }] }) });
    const projection = project([partial(1), partial(2)]);
    expect(projection.milestones).toHaveLength(2);
    expect(projection.completions).toEqual([]);
    expect(projection.achievements).toEqual([]);
    expect(projection.summary.distinctProblems).toBe(0);
  });

  it.each([
    { label: "escopo parcial", verification: official({ scope: "partial" }) },
    { label: "estágio ausente", verification: official({ stages: [] }) },
    { label: "estágio incompleto", verification: official({ stages: [{ number: 1, passed: true, fullyEvaluated: false }] }) },
    { label: "falha em teste", verification: official({ stages: [{ number: 1, passed: false, fullyEvaluated: true }] }) },
    { label: "estágio duplicado", verification: official({ stages: [{ number: 1, passed: true, fullyEvaluated: true }, { number: 1, passed: true, fullyEvaluated: true }] }) },
    { label: "nenhum estágio requerido", verification: official({ requiredStages: [] }) }
  ])("não declara conclusão por accepted com $label", ({ verification }) => {
    expect(project([evidence({ verification })]).completions).toEqual([]);
  });

  it("reconhece apenas estágios realmente confirmados em uma submissão parcialmente correta", () => {
    const projection = project([progressive({ verdict: "wrong_answer", verification: official({ requiredStages: [1, 2], stages: [
      { number: 1, unitId: "first", fullyEvaluated: true, passed: true }, { number: 2, unitId: "second", fullyEvaluated: true, passed: false }
    ] }) })]);
    expect(projection.milestones.map((item) => item.unitId)).toEqual(["first"]);
    expect(projection.summary.distinctProblems).toBe(0);
  });

  it.each(["demo", "local", "legacy_unverified"] as const)("mantém %s sem conquistas ou elegibilidade oficial", (kind) => {
    const projection = project([evidence({ verification: { kind } })]);
    expect(projection.unverifiedSubmissions).toBe(1);
    expect(projection.milestones).toEqual([]);
    expect(projection.achievements).toEqual([]);
    expect(projection.publicEligibleAchievements).toEqual([]);
  });

  it.each([
    { label: "run", patch: { kind: "run" } },
    { label: "erro de infraestrutura", patch: { verdict: "system_error" } },
    { label: "referência", patch: { purpose: "reference" } },
    { label: "validação", patch: { purpose: "validation" } },
    { label: "smoke", patch: { purpose: "smoke_test" } }
  ] as const)("$label não concede reconhecimento nem apaga uma conclusão anterior", ({ patch }) => {
    expect(project([progressive(patch)]).milestones).toEqual([]);
    const original = project([evidence()]);
    expect(project([evidence(), progressive({ ...patch, submissionId: "ignored" })]).milestones).toEqual(original.milestones);
  });

  it("não trata somente fixtures públicas ou link externo como avaliação oficial completa", () => {
    for (const value of [evidence({ verification: official({ bundleComplete: false }) }), evidence({ problem: { ...evidence().problem, origin: "external_link" } })]) {
      expect(project([value]).achievements).toEqual([]);
      expect(project([value]).unverifiedSubmissions).toBe(1);
    }
  });

  it.each(["private", "unlisted"] as const)("conta prática %s apenas pessoalmente, sem data pública derivada", (visibility) => {
    const own = evidence({ problem: { ...evidence().problem, visibility } });
    const projection = project([own]);
    expect(projection.summary.distinctProblems).toBe(1);
    expect(projection.achievements).toHaveLength(1);
    expect(projection.publicEligibleAchievements).toEqual([]);
    expect(projection.milestones[0]?.publicEligible).toBe(false);
  });

  it.each(["authorId", "requestedBy"] as const)("questão nativa própria via %s não produz reconhecimento público", (field) => {
    const projection = project([evidence({ problem: { ...evidence().problem, [field]: "alice" } })]);
    expect(projection.achievements).toHaveLength(1);
    expect(projection.publicEligibleAchievements).toEqual([]);
  });

  it("não confunde solicitante de importação com autor e exige revisão do bundle para público", () => {
    const imported = evidence({ problem: { ...evidence().problem, origin: "licensed_import", requestedBy: "alice" } });
    expect(project([imported]).publicEligibleAchievements).toHaveLength(1);
    expect(project([evidence({ verification: official({ bundleReviewed: false }) })]).publicEligibleAchievements).toEqual([]);
    expect(project([evidence({ problem: { ...evidence().problem, authorId: undefined } })]).publicEligibleAchievements).toEqual([]);
  });

  it("publicação posterior não requalifica um marco privado nem vaza a data privada", () => {
    const privateSolve = evidence({ problem: { ...evidence().problem, visibility: "private" } });
    const later = evidence({ submissionId: "later", problemVersion: 2, occurredAt: "2026-09-10T12:00:00Z" });
    const another = evidence({ submissionId: "another", problemId: "p2", canonicalProblemId: "c2", occurredAt: "2026-09-11T12:00:00Z" });
    expect(project([privateSolve, later]).publicEligibleAchievements).toEqual([]);
    const projection = project([privateSolve, later, another]);
    expect(projection.achievements[0]?.awardedAt).toBe("2026-09-09T12:00:00.000Z");
    expect(projection.publicEligibleAchievements[0]?.awardedAt).toBe("2026-09-11T12:00:00.000Z");
  });

  it("a conquista de repertório exige cinco identidades canônicas públicas revisadas", () => {
    const duplicates = Array.from({ length: 5 }, (_, index) => evidence({ submissionId: `s${index}`, problemId: `variant-${index}` }));
    expect(project(duplicates).achievements.map((item) => item.id)).not.toContain("five_catalog_problems");
    const distinct = duplicates.map((item, index) => ({ ...item, canonicalProblemId: `canonical-${index}` }));
    distinct[4]!.problem = { ...distinct[4]!.problem, catalogReviewed: false };
    expect(project(distinct).achievements.map((item) => item.id)).not.toContain("five_catalog_problems");
  });

  it("não transforma recorte incompleto em totais definitivos ou conquistas datadas", () => {
    const projection = project([evidence()], false);
    expect(projection.historyComplete).toBe(false);
    expect(projection.summary.distinctProblems).toBe(1);
    expect(projection.achievements).toEqual([]);
    expect(projection.publicEligibleAchievements).toEqual([]);
    expect(summarizePracticeWeeks(projection, [week()])[0]?.status).toBe("incomplete_history");
  });

  it("ignora outros usuários e não copia código ou metadados ocultos para a projeção", () => {
    const own = { ...evidence(), source: "segredo-source", hiddenTests: "segredo-test" };
    const projection = project([own, evidence({ userId: "bob", problemId: "private-bob" })]);
    expect(projection.summary.distinctProblems).toBe(1);
    expect(JSON.stringify(projection)).not.toMatch(/segredo|private-bob|"bob"/);
    expect(own.source).toBe("segredo-source");
  });
});

describe("meta semanal pessoal", () => {
  it("abre na segunda-feira local e congela meta/fuso durante a semana", () => {
    const snapshot = week();
    expect(snapshot).toMatchObject({ weekStart: "2026-09-07", startsAt: "2026-09-07T03:00:00.000Z", endsAt: "2026-09-14T03:00:00.000Z", goalDays: 3 });
    const changed = freezePracticeWeek({ userId: "alice", at: "2026-09-10T12:00:00Z", preferences: { timeZone: "Asia/Tokyo", goalDays: 7 } }, snapshot);
    expect(changed).toEqual(snapshot);
    expect(changed).not.toBe(snapshot);
    const next = week("2026-09-14T04:00:00Z", { timeZone: "America/Sao_Paulo", goalDays: 7 });
    expect(next.goalDays).toBe(7);
    expect(next.weekStart).toBe("2026-09-14");
  });

  it.each([
    ["America/Sao_Paulo", "2026-09-14T02:59:59Z", "2026-09-07"],
    ["America/Sao_Paulo", "2026-09-14T03:00:00Z", "2026-09-14"],
    ["Asia/Tokyo", "2026-09-13T15:00:00Z", "2026-09-14"],
    ["UTC", "2027-01-01T10:00:00Z", "2026-12-28"]
  ])("calendário em %s para %s", (timeZone, at, weekStart) => {
    expect(week(at, { timeZone, goalDays: 3 }).weekStart).toBe(weekStart);
  });

  it.each([
    ["2026-03-04T12:00:00Z", 167],
    ["2026-10-28T12:00:00Z", 169]
  ])("respeita horário de verão em %s (%s horas)", (at, hours) => {
    const snapshot = week(at, { timeZone: "America/New_York", goalDays: 3 });
    expect((Date.parse(snapshot.endsAt) - Date.parse(snapshot.startsAt)) / 3_600_000).toBe(hours);
  });

  it("marcos no mesmo dia contam uma vez; replay e nova versão não contam em outro dia", () => {
    const first = progressive();
    const retry = progressive({ submissionId: "retry", problemVersion: 2, occurredAt: "2026-09-10T12:00:00Z" });
    const python = progressive({ submissionId: "python", runtime: "python", occurredAt: "2026-09-11T12:00:00Z" });
    const summary = summarizePracticeWeeks(project([first, first, retry, python]), [week()])[0]!;
    expect(summary.days).toEqual(["2026-09-09", "2026-09-11"]);
    expect(summary.progressDays).toBe(2);
    expect(summary.status).toBe("in_progress");
  });

  it("conta privado na meta pessoal, usa intervalo semiaberto e não penaliza semana incompleta", () => {
    const first = evidence({ occurredAt: "2026-09-14T02:59:59Z", problem: { ...evidence().problem, visibility: "private" } });
    const next = evidence({ submissionId: "next", canonicalProblemId: "c2", problemId: "p2", occurredAt: "2026-09-14T03:00:00Z" });
    const projection = project([first, next]);
    const results = summarizePracticeWeeks(projection, [week(), week("2026-09-14T12:00:00Z")]);
    expect(results.map((item) => item.days)).toEqual([["2026-09-13"], ["2026-09-14"]]);
    expect(results.map((item) => item.status)).toEqual(["in_progress", "in_progress"]);
    expect(projection.achievements.map((item) => item.id)).toContain("first_solution");
  });

  it("é opt-in: desativar não cria meta implícita nem retira conquistas", () => {
    const projection = project([evidence()]);
    const off = week(undefined, { timeZone: "America/Sao_Paulo", goalDays: null });
    expect(summarizePracticeWeeks(projection, [off])[0]).toMatchObject({ status: "disabled", days: [], progressDays: 0, goalDays: null });
    expect(projection.achievements).toHaveLength(1);
    expect(summarizePracticeWeeks(projection, [week(undefined, { timeZone: "America/Sao_Paulo", goalDays: 1 })])[0]?.status).toBe("met");
  });

  it.each([0, 8, 2.5, NaN])("rejeita meta inválida %s", (goalDays) => {
    expect(() => week(undefined, { timeZone: "UTC", goalDays })).toThrow("meta");
  });

  it("rejeita fusos, datas e snapshots inválidos ou de outro usuário", () => {
    expect(() => week(undefined, { timeZone: "America/Invalid", goalDays: 3 })).toThrow("fuso");
    expect(() => week("2026-09-09T12:00:00")).toThrow("ISO");
    expect(() => summarizePracticeWeeks(project([]), [{ ...week(), userId: "bob" }])).toThrow("outro usuário");
    expect(() => summarizePracticeWeeks(project([]), [{ ...week(), weekStart: "2026-09-08" }])).toThrow("Snapshot");
    expect(() => freezePracticeWeek({ userId: "alice", at: "2026-09-15T12:00:00Z", preferences: { timeZone: "UTC", goalDays: 3 } }, week())).toThrow("snapshot");
  });

  it("rejeita sobreposição na mudança de fuso em vez de reagrupar eventos retroativamente", () => {
    const old = week();
    const shifted = week("2026-09-14T04:00:00Z", { timeZone: "UTC", goalDays: 3 });
    expect(() => summarizePracticeWeeks(project([evidence()]), [old, shifted])).toThrow("sobrepostas");
  });
});
