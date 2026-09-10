import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAiAdapter } from "../../authoring/src/local-ai.js";
import { LocalJudgeAdapter } from "../src/local.js";

const require = createRequire(import.meta.url);
const esbuildRequire = createRequire(require.resolve("esbuild/package.json"));
const actor = { id: "00000000-0000-4000-8000-000000000001", handle: "compiler-test", role: "user" as const };

afterEach(() => vi.unstubAllEnvs());

describe(`compilador local em ${process.platform}/${process.arch}`, () => {
  it("executa o binário nativo instalado, sem passá-lo ao interpretador Node", async () => {
    // Linux postinstall replaces esbuild/bin/esbuild with an ELF executable.
    // Exercising the native executable also catches that interpreter bug on Windows.
    const native = esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/${process.platform === "win32" ? "esbuild.exe" : "bin/esbuild"}`);
    vi.stubEnv("SILOGIUM_ESBUILD_CLI", native);
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "compilador nativo", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
      kind: "submission", problemId: generated.problem.id, problemVersion: 1, runtime: "typescript", source: generated.bundle.referenceSolutions.typescript!
    });
    expect(result.verdict, result.message).toBe("accepted");
    expect(result.cases).toHaveLength(generated.bundle.visibleCases.length + generated.bundle.hiddenCases.length);
    expect(result.score).toBe(result.maxScore);
  }, 20_000);

  it("preserva o launcher padrão instalado na plataforma", async () => {
    vi.stubEnv("SILOGIUM_ESBUILD_CLI", "");
    const generated = await new LocalAiAdapter().create({ mode: "create", prompt: "launcher padrão", runtime: "typescript", format: "progressive", difficulty: "easy", visibility: "private" }, actor);
    const result = await new LocalJudgeAdapter().evaluate(generated.problem, generated.bundle, {
      kind: "submission", problemId: generated.problem.id, problemVersion: 1, runtime: "typescript", source: generated.bundle.referenceSolutions.typescript!
    });
    expect(result.verdict, result.message).toBe("accepted");
    expect(result.score).toBe(result.maxScore);
  }, 20_000);
});
