import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { seedProblems } from "@silogium/core";
import { ModalJudgeAdapter } from "../src/modal.js";

describe("contrato do judge remoto", () => {
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
