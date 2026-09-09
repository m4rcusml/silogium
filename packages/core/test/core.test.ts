import { describe, expect, it } from "vitest";
import { ProblemDefinitionSchema, canReadProblem, checkQuota, problemFingerprint, searchCatalog, seedProblems, transitionProblem } from "../src/index.js";

describe("ProblemDefinitionV1", () => {
  it("valida as questões migradas", () => {
    expect(seedProblems).toHaveLength(3);
    for (const problem of seedProblems) expect(ProblemDefinitionSchema.parse(problem)).toEqual(problem);
  });

  it("mantém o fingerprint estável", () => {
    const problem = seedProblems[0]!;
    expect(problemFingerprint(problem)).toBe(problemFingerprint({ ...problem, tags: [...problem.tags].reverse() }));
  });
});

describe("catálogo e publicação", () => {
  it("lista somente questões públicas", () => {
    expect(searchCatalog(seedProblems, { runtime: "typescript" })).toHaveLength(3);
    expect(searchCatalog(seedProblems, { query: "reservas" })[0]?.slug).toBe("reservas-de-coworking");
  });

  it("impede publicação sem administrador", () => {
    const validated = { ...seedProblems[0]!, status: "validated" as const, visibility: "private" as const };
    const pending = transitionProblem(validated, "pending_review", { id: "system", handle: "system", role: "user" });
    expect(() => transitionProblem(pending, "published", { id: "system", handle: "system", role: "user" })).toThrow();
    expect(transitionProblem(pending, "published", { id: "admin", handle: "admin", role: "admin" }).visibility).toBe("public");
  });

  it("protege questões privadas", () => {
    const problem = { ...seedProblems[0]!, status: "validated" as const, visibility: "private" as const };
    expect(canReadProblem(problem)).toBe(false);
    expect(canReadProblem(problem, { id: "system", handle: "system", role: "user" })).toBe(true);
  });
});

describe("cotas", () => {
  it("aplica o limite por minuto", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const events = Array.from({ length: 10 }, () => ({ kind: "remote_execution" as const, occurredAt: now }));
    expect(checkQuota("remote_execution", events, now)).toMatchObject({ allowed: false, retryAfterSeconds: 60 });
  });

  it("aplica as cotas diárias de IA e execução remota", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const aiEvents = Array.from({ length: 5 }, () => ({ kind: "ai" as const, occurredAt: now }));
    const executionEvents = Array.from({ length: 50 }, (_, index) => ({
      kind: "remote_execution" as const,
      occurredAt: new Date(now.getTime() - index * 61_000)
    }));
    expect(checkQuota("ai", aiEvents, now).allowed).toBe(false);
    expect(checkQuota("remote_execution", executionEvents, now).allowed).toBe(false);
  });
});
