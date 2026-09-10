import { randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { JudgeBundleSchema, ProblemDefinitionSchema, type JudgeBundle, type JudgeCase, type ProblemDefinition } from "@silogium/core";

const stdio = (stdin: string, expectedStdout: string): JudgeCase => ({
  kind: "stdio", id: `private-${randomUUID()}`, name: "Caso privado", stage: 1, stdin, expectedStdout
});

/** Independent slow oracles for small random inputs; never execute the reference
 * being checked to produce expected outputs. Actual fixtures live outside Git. */
export function privateClassicCases(slug: string): JudgeCase[] {
  const result: JudgeCase[] = [];
  if (slug === "pacotes-complementares") {
    const add = (volumes: number[], target: number) => {
      let expected = "-1\n";
      outer: for (let j = 1; j < volumes.length; j++) for (let i = 0; i < j; i++) {
        if (volumes[i]! + volumes[j]! === target) { expected = `${i + 1} ${j + 1}\n`; break outer; }
      }
      result.push(stdio(`${volumes.length} ${target}\n${volumes.join(" ")}\n`, expected));
    };
    for (let i = 0; i < 6; i++) {
      const volumes = Array.from({ length: randomInt(7, 65) }, () => randomInt(0, 101));
      add(volumes, i % 2 ? randomInt(0, 201) : volumes[0]! + volumes.at(-1)!);
    }
    const x = randomInt(1000, 1000000);
    add([x, x, x, x + 1, x + 1], 2 * x + 1);
    add([x, 1, 2], 2 * x);
    add([x, 1, x - 1, 2, 0], x + 1);
  } else if (slug === "janelas-de-manutencao") {
    const add = (intervals: number[][]) => {
      const points = [...new Set(intervals.flat())].sort((a, b) => a - b);
      let total = 0, longest = 0, span = 0;
      for (let i = 1; i < points.length; i++) {
        const left = points[i - 1]!, right = points[i]!;
        if (intervals.some(([a, b]) => a! <= left && right <= b!)) {
          total += right - left; span += right - left; longest = Math.max(longest, span);
        } else span = 0;
      }
      result.push(stdio(`${intervals.length}\n${intervals.map((pair) => pair.join(" ")).join("\n")}\n`, `${total} ${longest}\n`));
    };
    for (let i = 0; i < 6; i++) {
      const offset = randomInt(100, 999000000);
      add(Array.from({ length: randomInt(4, 40) }, () => { const a = offset + randomInt(0, 90); return [a, a + randomInt(1, 25)]; }));
    }
    const x = randomInt(100, 999000000), width = randomInt(2, 100);
    add([[x + width, x + 2 * width], [x, x + width]]);
    add([[x, x + 3 * width], [x + 1, x + width], [x, x + 2 * width]]);
    add([[x + width, x + width + 1], [x, x + 1], [x + 4 * width, x + 6 * width]]);
  } else if (slug === "rotas-da-estacao") {
    const add = (n: number, source: number, target: number, edges: number[][], expected?: string) => {
      if (expected === undefined) {
        // Counts walks of each exact length, not a BFS like the reference.
        let ways = Array<bigint>(n + 1).fill(0n); ways[source] = 1n;
        expected = "-1 0\n";
        for (let distance = 0; distance < n; distance++) {
          if (ways[target]! > 0n) { expected = `${distance} ${ways[target]! % 1000000007n}\n`; break; }
          const next = Array<bigint>(n + 1).fill(0n);
          for (const [u, v] of edges) { next[u!] = next[u!]! + ways[v!]!; next[v!] = next[v!]! + ways[u!]!; }
          ways = next;
        }
      }
      result.push(stdio(`${n} ${edges.length} ${source} ${target}\n${edges.map((pair) => pair.join(" ")).join("\n")}\n`, expected));
    };
    for (let i = 0; i < 6; i++) {
      const n = randomInt(5, 22), edges: number[][] = [];
      for (let u = 1; u <= n; u++) for (let v = u + 1; v <= n; v++) if (randomInt(0, 6) === 0) edges.push([u, v]);
      add(n, randomInt(1, n + 1), randomInt(1, n + 1), edges);
    }
    const n = randomInt(80, 120);
    add(n, n, 1, Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2]), `${n - 1} 1\n`);
    add(n, n, 1, [[1, 2], [2, 3]], "-1 0\n");
    const layers = randomInt(34, 46), target = 2 * layers + 2;
    const edges = [[1, 2], [1, 3]];
    for (let i = 1; i < layers; i++) for (const u of [2 * i, 2 * i + 1]) for (const v of [2 * i + 2, 2 * i + 3]) edges.push([u, v]);
    edges.push([2 * layers, target], [2 * layers + 1, target]);
    add(target, 1, target, edges, `${layers + 1} ${(2n ** BigInt(layers)) % 1000000007n}\n`);
  } else throw new Error(`Não há gerador privado para ${slug}.`);
  return result;
}

/** Resolve symlinks too: an ignored folder in a public checkout is not a vault. */
export function assertExternalPrivateDirectory(root: string, directory: string): string {
  const realDirectory = realpathSync(directory);
  const path = relative(realpathSync(root), realDirectory);
  if (!path || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))) {
    throw new Error("Os bundles privados precisam ficar fora do repositório público.");
  }
  return realDirectory;
}

export function validateSeedBundle(problem: ProblemDefinition, input: unknown, requirePrivate: boolean): JudgeBundle {
  const bundle = JudgeBundleSchema.parse(input);
  if (bundle.problemId !== problem.id || bundle.problemVersion !== problem.version) throw new Error(`${problem.slug}: identidade do bundle divergente.`);
  const cases = [...bundle.visibleCases, ...bundle.hiddenCases];
  const stages = new Set(problem.stages.map((stage) => stage.number));
  if (new Set(cases.map((test) => test.id)).size !== cases.length) throw new Error(`${problem.slug}: IDs de testes duplicados.`);
  if (cases.some((test) => !stages.has(test.stage) || test.kind !== problem.executionModel)) throw new Error(`${problem.slug}: estágio ou modelo de execução inválido.`);
  for (const runtime of problem.runtimes) if (!bundle.referenceSolutions[runtime.language]?.trim()) throw new Error(`${problem.slug}: referência ${runtime.language} ausente.`);
  if (requirePrivate && problem.stages.some((stage) => !bundle.hiddenCases.some((test) => test.stage === stage.number))) {
    throw new Error(`${problem.slug}: falta teste privado em pelo menos um estágio.`);
  }
  const inputKey = (test: JudgeCase) => JSON.stringify(test.kind === "stdio"
    ? { kind: test.kind, stdin: test.stdin.trim().replace(/\s+/g, " ") }
    : { kind: test.kind, constructorArgs: test.constructorArgs, calls: test.calls.map(({ method, args }) => ({ method, args })) });
  const publicInputs = new Set(bundle.visibleCases.map(inputKey));
  if (bundle.hiddenCases.some((test) => publicInputs.has(inputKey(test)))) throw new Error(`${problem.slug}: um teste privado repete uma entrada pública.`);
  return bundle;
}

/** Read and validate the entire seed before any database write. */
export function loadSeedPackages(root: string, directory: string | undefined, requirePrivate = true) {
  const privateDirectory = directory ? assertExternalPrivateDirectory(root, directory) : undefined;
  if (requirePrivate && !privateDirectory) throw new Error("Configure SILOGIUM_PRIVATE_BUNDLES_DIR fora do repositório antes do seed.");
  const problems = ProblemDefinitionSchema.array().parse(JSON.parse(readFileSync(resolve(root, "content/problems/generated-catalog.json"), "utf8")));
  return problems.map((problem) => {
    const visible = JSON.parse(readFileSync(resolve(root, `content/judge/${problem.slug}.visible.json`), "utf8"));
    const privatePath = privateDirectory && resolve(privateDirectory, `${problem.slug}.private.json`);
    if (requirePrivate && (!privatePath || !existsSync(privatePath))) throw new Error(`${problem.slug}: bundle privado ausente.`);
    const hidden = privatePath && existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, "utf8")) : {};
    const references: JudgeBundle["referenceSolutions"] = { ...hidden.referenceSolutions };
    for (const [runtime, extension] of [["typescript", "ts"], ["python", "py"]] as const) {
      const privateRef = privateDirectory && resolve(privateDirectory, `${problem.slug}.reference.${extension}`);
      const publicRef = resolve(root, "reference-solutions", runtime, `${problem.slug}.${extension}`);
      const legacy = runtime === "typescript" && problem.slug === "rede-de-armarios" ? resolve(root, "reference-solutions/typescript/question1.ts") : undefined;
      const ref = [privateRef, publicRef, legacy].find((path) => path && existsSync(path));
      if (ref) references[runtime] = readFileSync(ref, "utf8").replace(/\r\n/g, "\n");
    }
    return { problem, bundle: validateSeedBundle(problem, { ...visible, hiddenCases: hidden.hiddenCases ?? [], referenceSolutions: references }, requirePrivate) };
  });
}
