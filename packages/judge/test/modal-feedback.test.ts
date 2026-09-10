import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("diagnósticos dos wrappers Modal", () => {
  for (const runtime of ["typescript", "python"] as const) {
    it(`mantém o orçamento de saída ao acrescentar diffs em ${runtime}`, async () => {
      const source = await readFile(resolve(process.cwd(), "infra/modal/app.py"), "utf8");
      const pattern = runtime === "typescript" ? /TS_CALL_RUNNER = r'''([\s\S]*?)'''/ : /PY_CALL_RUNNER = r'''([\s\S]*?)'''/;
      const wrapper = source.match(pattern)?.[1];
      expect(wrapper).toBeTruthy();
      const directory = await mkdtemp(join(tmpdir(), "silogium-modal-feedback-"));
      try {
        const cases = Array.from({ length: 5 }, (_, index) => ({ kind: "call-sequence", id: `case-${index}`, name: "Entrada grande", stage: 1, constructorArgs: [], calls: [{ method: "add", args: ["x".repeat(3000)], expected: 1 }] }));
        const payload = {
          request: { runtime, kind: "run" },
          problem: { limits: { outputBytes: 1024 }, runtimes: [{ language: runtime, entrypoint: { symbol: "SequenceWorkbench", methodMap: {} } }] },
          bundle: { visibleCases: cases, hiddenCases: [] }
        };
        const extension = runtime === "typescript" ? "mjs" : "py";
        await writeFile(join(directory, "payload.json"), JSON.stringify(payload));
        await writeFile(join(directory, `solution.${extension}`), runtime === "typescript" ? "export class SequenceWorkbench { add(value) { return 0; } }" : "class SequenceWorkbench:\n    def add(self, value):\n        return 0\n");
        const runnerPath = join(directory, `runner.${extension}`);
        await writeFile(runnerPath, wrapper!.replaceAll("/work/", directory.replaceAll("\\", "/") + "/"));
        const command = runtime === "typescript" ? process.execPath : process.platform === "win32" ? "python.exe" : "python3";
        const { stdout } = await execute(command, [runnerPath], { cwd: directory, timeout: 10_000, windowsHide: true });
        const outcomes = JSON.parse(stdout);
        expect(Buffer.byteLength(stdout)).toBeLessThanOrEqual(1024);
        expect(outcomes).toHaveLength(5);
        expect(outcomes.every((outcome: { passed: boolean }) => !outcome.passed)).toBe(true);
        expect(outcomes.some((outcome: { mismatch?: unknown }) => outcome.mismatch)).toBe(true);
        expect(outcomes.every((outcome: { mismatch?: { input?: unknown } }) => outcome.mismatch?.input === undefined)).toBe(true);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 15_000);
  }
});
