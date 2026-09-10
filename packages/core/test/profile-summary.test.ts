import { describe, expect, it } from "vitest";
import { summarizeProfileActivity } from "../../../apps/web/lib/profile-summary.js";
import type { Runtime, Verdict } from "../src/schemas.js";

function attempt(id: string, problemId: string, kind: "run" | "submission", verdict: Verdict, runtime: Runtime = "typescript") {
  return { request: { problemId, kind, runtime }, result: { id, verdict } };
}

describe("resumo do perfil no recorte de atividade", () => {
  it("não transforma execuções aceitas em submissões aceitas e exclui falhas de infraestrutura", () => {
    expect(summarizeProfileActivity([
      attempt("run", "a", "run", "accepted"),
      attempt("ok", "a", "submission", "accepted"),
      attempt("fail", "b", "submission", "wrong_answer", "python"),
      attempt("system", "c", "submission", "system_error", "python")
    ])).toEqual({ problemsPracticed: 2, submissions: 2, acceptedSubmissions: 1, runs: 1, systemErrors: 1, languages: [{ runtime: "typescript", attempts: 2 }, { runtime: "python", attempts: 1 }] });
  });

  it("deduplica registros e questões, sem inventar conclusões ou totais históricos", () => {
    const accepted = attempt("ok", "a", "submission", "accepted");
    const summary = summarizeProfileActivity([accepted, accepted, attempt("ok-next-version", "a", "submission", "accepted")]);
    expect(summary.problemsPracticed).toBe(1);
    expect(summary.acceptedSubmissions).toBe(2);
    expect(summary).not.toHaveProperty("solvedProblems");
  });

  it("representa um recorte vazio sem linguagens artificiais", () => {
    expect(summarizeProfileActivity([])).toEqual({ problemsPracticed: 0, submissions: 0, acceptedSubmissions: 0, runs: 0, systemErrors: 0, languages: [] });
  });
});
