import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { sanitizeExecutionResult, type ExecutionRequest, type ExecutionResult, type JudgeBundle, type JudgeCase, type ProblemDefinition, type RuntimeDefinition } from "@silogium/core";
import { scoreOutcomes } from "./scoring.js";
import type { CaseOutcome, Judge } from "./types.js";

type ProcessResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; outputLimited: boolean };
const moduleDirectory = dirname(fileURLToPath(import.meta.url));

function locateEsbuildCli(): string {
  if (process.env.SILOGIUM_ESBUILD_CLI && existsSync(process.env.SILOGIUM_ESBUILD_CLI)) return process.env.SILOGIUM_ESBUILD_CLI;
  let current = moduleDirectory;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, "node_modules", "esbuild", "bin", "esbuild");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Compilador TypeScript local não encontrado. Instale a dependência esbuild.");
}

function esbuildCommand(cli: string): [string, string[]] {
  // esbuild's postinstall may replace its JS launcher with the native binary.
  // Detect the actual file, preserving JS overrides and Windows' JS launcher.
  const header = Buffer.alloc(4);
  const descriptor = openSync(cli, "r");
  try { readSync(descriptor, header, 0, header.length, 0); }
  finally { closeSync(descriptor); }
  const native = header.subarray(0, 2).toString("ascii") === "MZ"
    || ["7f454c46", "feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe", "bebafeca"].includes(header.toString("hex"));
  return native ? [cli, []] : [process.execPath, [cli]];
}

function runtimeCommand(language: RuntimeDefinition["language"], script: string): [string, string[]] {
  return language === "typescript"
    ? [process.execPath, [script]]
    : [process.platform === "win32" ? "python.exe" : "python3", [script]];
}

function runProcess(command: string, args: string[], options: { cwd: string; input?: string; timeoutMs: number; outputBytes: number }): Promise<ProcessResult> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: options.cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputLimited = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + chunk.byteLength > options.outputBytes) {
        outputLimited = true;
        child.kill("SIGKILL");
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut, outputLimited });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      done({ exitCode, stdout, stderr, timedOut, outputLimited });
    });
    if (options.input !== undefined) child.stdin.end(options.input); else child.stdin.end();
  });
}

function typescriptRunner(): string {
  return `
import { pathToFileURL } from "node:url";
const [solutionPath, symbol, methodMapRaw, casesRaw, outputLimitRaw] = process.argv.slice(2);
const module = await import(pathToFileURL(solutionPath).href + "?v=" + Date.now());
const Constructor = module[symbol];
if (typeof Constructor !== "function") throw new Error("Símbolo exportado não encontrado: " + symbol);
const methodMap = JSON.parse(methodMapRaw);
const cases = JSON.parse(casesRaw);
const outcomes = [];
const jsonValue = (value) => { try { return JSON.parse(JSON.stringify(value) ?? '"[undefined]"'); } catch { return String(value); } };
for (const test of cases) {
  let mismatch;
  try {
    const instance = new Constructor(...test.constructorArgs);
    for (const call of test.calls) {
      const method = methodMap[call.method] || call.method;
      if (typeof instance[method] !== "function") throw new Error("Método não encontrado: " + method);
      const input = jsonValue(call.args);
      const actual = await instance[method](...call.args);
      if (JSON.stringify(actual) !== JSON.stringify(call.expected)) {
        mismatch = { expected: jsonValue(call.expected), actual: jsonValue(actual), method: call.method, input };
        throw new Error(method + ": esperado " + JSON.stringify(call.expected) + ", recebido " + JSON.stringify(actual));
      }
    }
    outcomes.push({ id: test.id, name: test.name, stage: test.stage, passed: true });
  } catch (error) {
    outcomes.push({ id: test.id, name: test.name, stage: test.stage, passed: false, message: error instanceof Error ? error.message : String(error), ...(mismatch ? { mismatch } : {}) });
  }
}
let remaining = Math.max(0, Number(outputLimitRaw) - Buffer.byteLength(JSON.stringify(outcomes.map(({ mismatch, ...outcome }) => outcome))) - 1);
for (const outcome of outcomes) {
  const mismatch = outcome.mismatch;
  delete outcome.mismatch;
  if (!mismatch) continue;
  if (mismatch.input !== undefined && Buffer.byteLength(JSON.stringify(mismatch.input)) > 2048) delete mismatch.input;
  const addedBytes = Buffer.byteLength(JSON.stringify({ ...outcome, mismatch })) - Buffer.byteLength(JSON.stringify(outcome));
  if (addedBytes <= 4096 && addedBytes <= remaining) {
    outcome.mismatch = mismatch;
    remaining -= addedBytes;
  }
}
console.log(JSON.stringify(outcomes));
`;
}

function pythonRunner(): string {
  return String.raw`
import importlib.util, inspect, json, sys
solution_path, symbol, method_map_raw, cases_raw, output_limit_raw = sys.argv[1:6]
spec = importlib.util.spec_from_file_location("silogium_solution", solution_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
constructor = getattr(module, symbol)
method_map = json.loads(method_map_raw)
cases = json.loads(cases_raw)
outcomes = []
def json_value(value):
    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError):
        return repr(value)
for test in cases:
    mismatch = None
    try:
        instance = constructor(*test.get("constructorArgs", []))
        for call in test["calls"]:
            method_name = method_map.get(call["method"], call["method"])
            method = getattr(instance, method_name)
            call_input = json_value(call["args"])
            actual = method(*call["args"])
            if inspect.isawaitable(actual):
                raise RuntimeError("Métodos assíncronos ainda não são suportados no runner Python")
            if actual != call["expected"]:
                mismatch = {"expected": json_value(call["expected"]), "actual": json_value(actual), "method": call["method"], "input": call_input}
                raise AssertionError(f"{method_name}: esperado {call['expected']!r}, recebido {actual!r}")
        outcomes.append({"id": test["id"], "name": test["name"], "stage": test["stage"], "passed": True})
    except Exception as error:
        outcomes.append({"id": test["id"], "name": test["name"], "stage": test["stage"], "passed": False, "message": str(error), **({"mismatch": mismatch} if mismatch is not None else {})})
legacy = [{key: value for key, value in outcome.items() if key != "mismatch"} for outcome in outcomes]
remaining = max(0, int(output_limit_raw) - len(json.dumps(legacy, ensure_ascii=False).encode("utf-8")) - 1)
for outcome in outcomes:
    mismatch = outcome.pop("mismatch", None)
    if mismatch is None:
        continue
    if "input" in mismatch and len(json.dumps(mismatch["input"], ensure_ascii=False).encode("utf-8")) > 2048:
        del mismatch["input"]
    added_bytes = len(json.dumps({**outcome, "mismatch": mismatch}, ensure_ascii=False).encode("utf-8")) - len(json.dumps(outcome, ensure_ascii=False).encode("utf-8"))
    if added_bytes <= 4096 and added_bytes <= remaining:
        outcome["mismatch"] = mismatch
        remaining -= added_bytes
print(json.dumps(outcomes, ensure_ascii=False))
`;
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

export class LocalJudgeAdapter implements Judge {
  async evaluate(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const runtime = problem.runtimes.find((item) => item.language === request.runtime);
    if (!runtime) return this.systemError("A linguagem não é suportada por esta questão.", startedAt);
    const selected = request.kind === "run" ? bundle.visibleCases : [...bundle.visibleCases, ...bundle.hiddenCases];
    const cases = selected.filter((item) => !request.maxStage || item.stage <= request.maxStage);
    const directory = await mkdtemp(join(tmpdir(), "silogium-judge-"));
    try {
      let sourcePath = join(directory, request.runtime === "typescript" ? "solution.mjs" : "solution.py");
      if (request.runtime === "typescript") {
        try {
          const typescriptPath = join(directory, "solution.ts");
          await writeFile(typescriptPath, request.source, "utf8");
          // Compilar em um processo separado exclui o cold start do orçamento de cada caso.
          const [compiler, compilerArgs] = esbuildCommand(locateEsbuildCli());
          const compiled = await runProcess(compiler, [
            ...compilerArgs,
            typescriptPath,
            "--format=esm",
            "--platform=node",
            "--target=node22",
            `--outfile=${sourcePath}`
          ], {
            cwd: directory,
            timeoutMs: 10_000,
            outputBytes: problem.limits.outputBytes
          });
          if (compiled.timedOut) return { ...this.failure("system_error", "O compilador local excedeu o tempo de inicialização."), id: crypto.randomUUID(), durationMs: Date.now() - startedAt };
          if (compiled.outputLimited) return { ...this.failure("compile_error", "A saída do compilador excedeu o limite."), id: crypto.randomUUID(), durationMs: Date.now() - startedAt };
          if (compiled.exitCode !== 0) return { ...this.failure("compile_error", compiled.stderr.trim() || "Falha ao compilar TypeScript."), id: crypto.randomUUID(), durationMs: Date.now() - startedAt };
        } catch (error) {
          return {
            ...this.failure("compile_error", error instanceof Error ? error.message : String(error)),
            id: crypto.randomUUID(),
            durationMs: Date.now() - startedAt
          };
        }
      } else {
        await writeFile(sourcePath, request.source, "utf8");
      }
      const outcomes = problem.executionModel === "stdio"
        ? await this.runStdio(runtime, sourcePath, cases, problem, directory)
        : await this.runCallSequences(runtime, sourcePath, cases, problem, directory);
      if ("verdict" in outcomes) return sanitizeExecutionResult({ ...outcomes, id: crypto.randomUUID(), durationMs: Date.now() - startedAt }, bundle, request.kind);
      const { score, maxScore } = scoreOutcomes(problem, outcomes);
      return sanitizeExecutionResult({
        id: crypto.randomUUID(),
        verdict: outcomes.every((item) => item.passed) ? "accepted" : "wrong_answer",
        score,
        maxScore,
        durationMs: Date.now() - startedAt,
        cases: outcomes
      }, bundle, request.kind);
    } finally {
      const safeDirectory = resolve(directory);
      if (safeDirectory.startsWith(resolve(tmpdir()))) await rm(safeDirectory, { recursive: true, force: true });
    }
  }

  private async runCallSequences(runtime: RuntimeDefinition, sourcePath: string, cases: JudgeCase[], problem: ProblemDefinition, directory: string): Promise<CaseOutcome[] | ExecutionResult> {
    const callCases = cases.filter((item) => item.kind === "call-sequence");
    if (callCases.length !== cases.length || runtime.entrypoint.kind !== "class") return this.systemError("Bundle incompatível com o entrypoint.", Date.now());
    const runnerPath = join(directory, runtime.language === "typescript" ? "runner.mjs" : "runner.py");
    await writeFile(runnerPath, runtime.language === "typescript" ? typescriptRunner() : pythonRunner(), "utf8");
    const [executable, prefix] = runtimeCommand(runtime.language, runnerPath);
    const args = [...prefix, sourcePath, runtime.entrypoint.symbol, JSON.stringify(runtime.entrypoint.methodMap), JSON.stringify(callCases), String(problem.limits.outputBytes)];
    const result = await runProcess(executable, args, {
      cwd: runtime.language === "typescript" ? moduleDirectory : directory,
      timeoutMs: Math.min(30_000, Math.max(problem.limits.timeMs, problem.limits.timeMs * callCases.length)),
      outputBytes: problem.limits.outputBytes
    });
    if (result.timedOut) return this.failure("time_limit", "Tempo limite excedido.");
    if (result.outputLimited) return this.failure("output_limit", "Limite de saída excedido.");
    if (result.exitCode !== 0) {
      const compileError = /SyntaxError|TS\d{4}|Cannot find module|não encontrado/i.test(result.stderr);
      return this.failure(compileError ? "compile_error" : "runtime_error", result.stderr.trim() || "A execução falhou.");
    }
    try {
      return JSON.parse(result.stdout.trim()) as CaseOutcome[];
    } catch {
      return this.failure("runtime_error", `Saída inválida do runner: ${result.stdout.slice(0, 500)}`);
    }
  }

  private async runStdio(runtime: RuntimeDefinition, sourcePath: string, cases: JudgeCase[], problem: ProblemDefinition, directory: string): Promise<CaseOutcome[] | ExecutionResult> {
    const outcomes: CaseOutcome[] = [];
    for (const test of cases) {
      if (test.kind !== "stdio") return this.systemError("Bundle incompatível com stdio.", Date.now());
      const [executable, args] = runtimeCommand(runtime.language, sourcePath);
      const result = await runProcess(executable, args, { cwd: runtime.language === "typescript" ? moduleDirectory : directory, input: test.stdin, timeoutMs: problem.limits.timeMs, outputBytes: problem.limits.outputBytes });
      if (result.timedOut) return this.failure("time_limit", "Tempo limite excedido.");
      if (result.outputLimited) return this.failure("output_limit", "Limite de saída excedido.");
      if (result.exitCode !== 0) {
        const compileError = /SyntaxError|Transform failed|TS\d{4}|Cannot find module/i.test(result.stderr);
        return this.failure(compileError ? "compile_error" : "runtime_error", result.stderr.trim() || "A execução falhou.");
      }
      const passed = normalizeOutput(result.stdout) === normalizeOutput(test.expectedStdout);
      outcomes.push({ id: test.id, name: test.name, stage: test.stage, passed, ...(passed ? {} : {
        message: `Esperado ${JSON.stringify(test.expectedStdout)}, recebido ${JSON.stringify(result.stdout)}`,
        mismatch: { expected: test.expectedStdout, actual: result.stdout, input: test.stdin }
      }) });
    }
    return outcomes;
  }

  private failure(verdict: ExecutionResult["verdict"], message: string): ExecutionResult {
    return { id: "", verdict, score: 0, maxScore: 0, durationMs: 0, cases: [], message };
  }

  private systemError(message: string, startedAt: number): ExecutionResult {
    return { ...this.failure("system_error", message), id: crypto.randomUUID(), durationMs: Date.now() - startedAt };
  }
}
