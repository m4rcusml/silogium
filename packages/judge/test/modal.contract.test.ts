import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedProblems, type ExecutionRequest, type ExecutionResult, type JudgeBundle } from "@silogium/core";
import { ModalJudgeAdapter } from "../src/modal.js";

const problem = seedProblems.find((item) => item.executionModel === "stdio")!;
const points = problem.stages[0]!.points;
const bundle: JudgeBundle = {
  schemaVersion: 1, problemId: problem.id, problemVersion: problem.version,
  visibleCases: [{ kind: "stdio", id: "public", name: "Visível", stage: 1, stdin: "1", expectedStdout: "1" }],
  hiddenCases: [{ kind: "stdio", id: "private", name: "entrada 371", stage: 1, stdin: "371", expectedStdout: "371" }],
  referenceSolutions: { typescript: "PRIVATE_REFERENCE_NEVER_SENT" }
};
const request: ExecutionRequest = {
  kind: "submission", problemId: problem.id, problemVersion: problem.version,
  runtime: "typescript", source: "console.log(0)"
};
function result(): ExecutionResult {
  return { id: "result", verdict: "accepted", score: points, maxScore: points, durationMs: 3,
    cases: [...bundle.visibleCases, ...bundle.hiddenCases].map(({ id, name, stage }) => ({ id, name, stage, passed: true })) };
}
function remote(value: ExecutionResult, envelope: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    const input = JSON.parse(options!.body as string);
    return new Response(JSON.stringify({ protocolVersion: 2, requestId: input.requestId, result: value, ...envelope }));
  });
}
afterEach(() => vi.restoreAllMocks());

describe("contrato do judge remoto v2", () => {
  it("envia somente dados necessários ao controlador autenticado, nunca referências ou starters", async () => {
    const output = result();
    output.verdict = "wrong_answer";
    output.score = Math.round(points / 2);
    output.cases[1] = { id: "private", name: "entrada 371", stage: 1, passed: false, message: "segredo", mismatch: { expected: 371, actual: 0 } };
    const mocked = remote(output);
    const actual = await new ModalJudgeAdapter("https://judge.invalid", "controller-secret").evaluate(problem, bundle, request);
    const sent = JSON.parse(mocked.mock.calls[0]![1]!.body as string);
    expect(sent.protocolVersion).toBe(2);
    expect(sent.requestId).toEqual(expect.any(String));
    expect(sent.bundle).not.toHaveProperty("referenceSolutions");
    expect(JSON.stringify(sent)).not.toContain("PRIVATE_REFERENCE_NEVER_SENT");
    expect(sent.problem).not.toHaveProperty("title");
    expect(sent.problem.runtimes[0]).not.toHaveProperty("starterCode");
    expect(sent.problem.stages[0]).not.toHaveProperty("statementMd");
    expect(mocked.mock.calls[0]![1]!.headers).toMatchObject({ authorization: "Bearer controller-secret" });
    expect(actual.verdict).toBe("wrong_answer");
    expect(actual.cases[1]).toEqual({ id: "private", name: "Teste oculto", stage: 1, passed: false });
  });

  it("não envia casos privados ao controlador quando Executar é solicitado", async () => {
    const output = result();
    output.cases = output.cases.slice(0, 1);
    const mocked = remote(output);
    const actual = await new ModalJudgeAdapter("https://judge.invalid").evaluate(problem, bundle, { ...request, kind: "run" });
    expect(JSON.parse(mocked.mock.calls[0]![1]!.body as string).bundle.hiddenCases).toEqual([]);
    expect(actual.verdict).toBe("accepted");
  });

  it("recusa endpoint antigo, ainda que ele devolva accepted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(result())));
    const actual = await new ModalJudgeAdapter("https://judge.invalid").evaluate(problem, bundle, request);
    expect(actual.verdict).toBe("system_error");
    expect(actual.message).toContain("v2");
  });

  it("vincula a resposta ao identificador desta solicitação", async () => {
    remote(result(), { requestId: "another-request" });
    const actual = await new ModalJudgeAdapter("https://judge.invalid").evaluate(problem, bundle, request);
    expect(actual.verdict).toBe("system_error");
  });

  for (const variant of ["empty", "missing", "duplicated", "unexpected", "stage", "score", "maxScore", "falseAccepted", "falseWrong", "passedMismatch", "failureCases"] as const) {
    it(`recusa resultado inconsistente: ${variant}`, async () => {
      const output = result();
      if (variant === "empty") output.cases = [];
      if (variant === "missing") output.cases.pop();
      if (variant === "duplicated") output.cases[1]!.id = "public";
      if (variant === "unexpected") output.cases[1]!.id = "made-up";
      if (variant === "stage") output.cases[1]!.stage = 2;
      if (variant === "score") output.score = 0;
      if (variant === "maxScore") output.maxScore = 1000;
      if (variant === "falseAccepted") output.cases[0]!.passed = false;
      if (variant === "falseWrong") output.verdict = "wrong_answer";
      if (variant === "passedMismatch") output.cases[0]!.mismatch = { expected: 1, actual: 0 };
      if (variant === "failureCases") { output.verdict = "system_error"; output.score = output.maxScore = 0; }
      remote(output);
      const actual = await new ModalJudgeAdapter("https://judge.invalid").evaluate(problem, bundle, request);
      expect(actual.verdict).toBe("system_error");
      expect(actual.cases).toEqual([]);
      expect(actual.score).toBe(0);
    });
  }

  it("limita o corpo HTTP antes de JSON.parse", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(" ".repeat(70 * 1024)));
    const actual = await new ModalJudgeAdapter("https://judge.invalid").evaluate(problem, bundle, request);
    expect(actual.verdict).toBe("system_error");
    expect(actual.message).toContain("transporte");
  });

  it("fixa imagens e rede no adapter, deixando verificação fora da sandbox", async () => {
    const source = await readFile(resolve(process.cwd(), "infra/modal/app.py"), "utf8");
    expect(source).toContain("node:22.22.0-bookworm-slim");
    expect(source).toContain("python:3.13.11-slim");
    expect(source).toContain("block_network=True");
    expect(source).toContain("include_oidc_identity_token=False");
    expect(source).toContain("timeout=30");
    expect(source).not.toContain("/work/payload.json");
    expect(source).not.toContain('json.loads(output.strip().splitlines()[-1])');
    expect(source).not.toContain("process.stdout.read()");
    expect(source).toContain("candidate_files(case)");
  });

  it("converte indisponibilidade do Modal em system_error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("serviço indisponível"));
    const actual = await new ModalJudgeAdapter("https://judge.invalid", "token").evaluate(problem, bundle, request);
    expect(actual.verdict).toBe("system_error");
    expect(actual.message).toContain("serviço indisponível");
  });
});
