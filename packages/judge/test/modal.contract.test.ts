import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { seedProblems } from "@silogium/core";
import { ModalJudgeAdapter } from "../src/modal.js";

describe("contrato do judge remoto", () => {
  it("não envia referências ao sandbox e sanitiza detalhes ocultos do serviço remoto", async () => {
    const problem = seedProblems[0]!;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      id: "result", verdict: "wrong_answer", score: 0, maxScore: 150, durationMs: 3,
      cases: [{ id: "private", name: "entrada 371", stage: 1, passed: false, message: "segredo", mismatch: { expected: 371, actual: 0 } }]
    }), { status: 200 }));
    try {
      const result = await new ModalJudgeAdapter("https://judge.invalid").evaluate(problem, {
        schemaVersion: 1, problemId: problem.id, problemVersion: problem.version,
        visibleCases: [], hiddenCases: [{ kind: "stdio", id: "private", name: "entrada 371", stage: 1, stdin: "371", expectedStdout: "371" }],
        referenceSolutions: { typescript: "solução privada" }
      }, { kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime: "typescript", source: "console.log(0)" });
      const payload = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(payload.bundle.referenceSolutions).toEqual({});
      expect(result.cases[0]).toEqual({ id: "private", name: "Teste oculto", stage: 1, passed: false });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("fixa runtimes, memória, timeout e bloqueio de rede no Sandbox", async () => {
    const source = await readFile(resolve(process.cwd(), "infra/modal/app.py"), "utf8");
    expect(source).toContain('node:22.22.0-bookworm-slim');
    expect(source).toContain('python:3.13.11-slim');
    expect(source).toMatch(/memory=\(256, 256\)/);
    expect(source).toContain("block_network=True");
    expect(source).toMatch(/timeout=30/);
  });

  it("converte indisponibilidade do Modal em system_error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("serviço indisponível"));
    const problem = seedProblems[0]!;
    const result = await new ModalJudgeAdapter("https://judge.invalid", "token").evaluate(problem, {
      schemaVersion: 1,
      problemId: problem.id,
      problemVersion: problem.version,
      visibleCases: [],
      hiddenCases: [],
      referenceSolutions: {}
    }, {
      kind: "run",
      problemId: problem.id,
      problemVersion: problem.version,
      runtime: "typescript",
      source: "console.log('ok')"
    });
    expect(result.verdict).toBe("system_error");
    expect(result.message).toContain("serviço indisponível");
    fetchMock.mockRestore();
  });
});
