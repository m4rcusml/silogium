import type { JudgeBundle, JudgeCase, RuntimeDefinition } from "@silogium/core";

/** Match the current deterministic judge's equality semantics for each runtime. */
function sameExpected(left: unknown, right: unknown, runtime: RuntimeDefinition["language"]): boolean {
  if (runtime === "typescript") return JSON.stringify(left) === JSON.stringify(right);
  if ((typeof left === "number" || typeof left === "boolean") && (typeof right === "number" || typeof right === "boolean")) return Number(left) === Number(right);
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameExpected(item, right[index], runtime));
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && sameExpected(a[key], b[key], runtime));
  }
  return left === right;
}

export type QualityCoverage = {
  visibleCases: number;
  hiddenCases: number;
  distinctInputs: number;
  observedSignals: string[];
  mutationChecks: Array<{ runtime: string; name: string; status: "killed" | "survived" | "inconclusive" | "not_applicable" }>;
};
const normalizedOutput = (value: string) => value.replace(/\r\n/g, "\n").trimEnd();
const inputKey = (test: JudgeCase) => test.kind === "stdio" ? test.stdin : JSON.stringify([test.constructorArgs, test.calls.map(({ method, args }) => [method, args])]);

/** Descriptive signals, not proof that every valid boundary condition was covered. */
export function inspectCoverage(bundle: JudgeBundle): QualityCoverage {
  const tests = [...bundle.visibleCases, ...bundle.hiddenCases];
  const signals = new Set<string>();
  const inspect = (value: unknown): void => {
    if (value === null) signals.add("valor nulo");
    if (typeof value === "number") {
      if (value === 0) signals.add("zero");
      if (value < 0) signals.add("negativos");
    }
    if (value === "") signals.add("texto vazio");
    if (Array.isArray(value)) {
      if (!value.length) signals.add("coleção vazia");
      if (value.length === 1) signals.add("coleção unitária");
      if (new Set(value.map((item) => JSON.stringify(item))).size < value.length) signals.add("valores repetidos");
      value.forEach(inspect);
    } else if (value && typeof value === "object") Object.values(value).forEach(inspect);
  };
  for (const test of tests) {
    if (test.kind === "stdio") {
      inspect(test.stdin);
      inspect(test.stdin.trim().split(/\s+/).filter(Boolean).map((token) => /^-?\d+(?:\.\d+)?$/.test(token) ? Number(token) : token));
    } else {
      inspect(test.constructorArgs);
      test.calls.forEach((call) => inspect(call.args));
      if (test.calls.length > 1) signals.add("sequência com estado");
      if (new Set(test.calls.map((call) => JSON.stringify([call.method, call.args]))).size < test.calls.length) signals.add("operação repetida");
    }
  }
  return { visibleCases: bundle.visibleCases.length, hiddenCases: bundle.hiddenCases.length, distinctInputs: new Set(tests.map(inputKey)).size, observedSignals: [...signals].sort(), mutationChecks: [] };
}

export type QualityMutation = { name: string; source?: string };

/** Known-defective overfitting/state variants. Equivalent variants are skipped.
 * Only visible expectations enter generated source; hidden fixtures stay in the judge. */
export function buildQualityMutations(runtime: RuntimeDefinition, bundle: JudgeBundle): QualityMutation[] {
  if (runtime.entrypoint.kind === "stdio") {
    const visible = bundle.visibleCases.filter((test) => test.kind === "stdio");
    const all = [...visible, ...bundle.hiddenCases.filter((test) => test.kind === "stdio")];
    const constant = visible[0]?.expectedStdout ?? "";
    const constantIsWrong = all.some((test) => normalizedOutput(test.expectedStdout) !== normalizedOutput(constant));
    const known = Object.fromEntries(visible.map((test) => [test.stdin, test.expectedStdout]));
    let unknown = "__silogium_unhandled_input__";
    while (all.some((test) => normalizedOutput(test.expectedStdout) === unknown)) unknown += "_";
    const overfitIsWrong = all.some((test) => normalizedOutput(Object.hasOwn(known, test.stdin) ? known[test.stdin]! : unknown) !== normalizedOutput(test.expectedStdout));
    return [
      { name: "resposta constante", ...(constantIsWrong ? { source: runtime.language === "typescript" ? `process.stdout.write(${JSON.stringify(constant)});` : `import sys\nsys.stdout.write(${JSON.stringify(constant)})\n` } : {}) },
      { name: "memoriza somente exemplos", ...(overfitIsWrong ? { source: runtime.language === "typescript"
        ? `import { readFileSync } from "node:fs";\nconst answers: Record<string,string> = ${JSON.stringify(known)};\nconst input = readFileSync(0, "utf8");\nprocess.stdout.write(Object.hasOwn(answers, input) ? answers[input]! : ${JSON.stringify(unknown)});`
        : `import json, sys\nanswers = json.loads(${JSON.stringify(JSON.stringify(known))})\nsys.stdout.write(answers.get(sys.stdin.read(), ${JSON.stringify(unknown)}))\n` } : {}) }
    ];
  }
  const entrypoint = runtime.entrypoint;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entrypoint.symbol)) return [{ name: "consulta sem estado" }];
  const visible = bundle.visibleCases.filter((test) => test.kind === "call-sequence");
  const all = [...visible, ...bundle.hiddenCases.filter((test) => test.kind === "call-sequence")];
  const pythonAnswers = visible.flatMap((test) => test.calls.map((call) => [entrypoint.methodMap[call.method] ?? call.method, call.args, call.expected] as const));
  const table: Record<string, unknown> = {};
  for (const test of visible) for (const call of test.calls) {
    const key = JSON.stringify([entrypoint.methodMap[call.method] ?? call.method, call.args]);
    if (!Object.hasOwn(table, key)) table[key] = call.expected;
  }
  let missing = "__silogium_unhandled_call__";
  while (all.some((test) => test.calls.some((call) => call.expected === missing))) missing += "_";
  const wrong = all.some((test) => test.calls.some((call) => {
    const key = JSON.stringify([entrypoint.methodMap[call.method] ?? call.method, call.args]);
    const pythonAnswer = pythonAnswers.find((answer) => answer[0] === (entrypoint.methodMap[call.method] ?? call.method) && sameExpected(answer[1], call.args, "python"));
    const answer = runtime.language === "python" ? (pythonAnswer ? pythonAnswer[2] : missing) : (Object.hasOwn(table, key) ? table[key] : missing);
    return !sameExpected(answer, call.expected, runtime.language);
  }));
  const methods = [...new Set(all.flatMap((test) => test.calls.map((call) => entrypoint.methodMap[call.method] ?? call.method)))];
  if (!wrong || methods.some((method) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(method) || ["constructor", "__init__", "__getattr__"].includes(method))) return [{ name: "consulta sem estado" }];
  const source = runtime.language === "typescript"
    ? `const answers: Record<string,unknown> = ${JSON.stringify(table)};\nexport class ${entrypoint.symbol} {\nconstructor(..._args: unknown[]) {}\n${methods.map((method) => `${method}(...args: unknown[]): unknown { const key = JSON.stringify([${JSON.stringify(method)}, args]); return Object.hasOwn(answers, key) ? structuredClone(answers[key]) : ${JSON.stringify(missing)}; }`).join("\n")}\n}`
    : `import json, copy\n_answers = json.loads(${JSON.stringify(JSON.stringify(pythonAnswers))})\nclass ${entrypoint.symbol}:\n    def __init__(self, *args):\n        pass\n${methods.map((method) => `    def ${method}(self, *args):\n        for method, inputs, answer in _answers:\n            if method == ${JSON.stringify(method)} and inputs == list(args):\n                return copy.deepcopy(answer)\n        return ${JSON.stringify(missing)}`).join("\n")}\n`;
  return [{ name: "consulta sem estado", source }];
}

export function fixturesAreConsistent(cases: JudgeCase[], runtime: RuntimeDefinition["language"] = "typescript"): boolean {
  const outputs = new Map<string, unknown>();
  for (const test of cases) {
    if (test.kind === "stdio") {
      const key = `stdio:${test.stdin}`;
      const expected = normalizedOutput(test.expectedStdout);
      if (outputs.has(key) && outputs.get(key) !== expected) return false;
      outputs.set(key, expected);
    } else {
      const prefix: unknown[] = [test.constructorArgs];
      for (const call of test.calls) {
        prefix.push([call.method, call.args]);
        const key = `calls:${JSON.stringify(prefix)}`;
        const expected = call.expected;
        if (outputs.has(key) && !sameExpected(outputs.get(key), expected, runtime)) return false;
        outputs.set(key, expected);
      }
    }
  }
  return true;
}

export function isJsonFixture(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value) || ancestors.size > 100) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Array.isArray(value) && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).some((present) => !present)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((child) => isJsonFixture(child, ancestors));
  ancestors.delete(value);
  return valid;
}
