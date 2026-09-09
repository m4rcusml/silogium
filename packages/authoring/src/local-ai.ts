import type { Actor, ContentRequest, JudgeBundle, ProblemDefinition, Runtime } from "@silogium/core";
import type { AiAuthoringAdapter, LicensedExerciseSource, SearchCandidate } from "./types.js";

function starter(runtime: Runtime): string {
  return runtime === "typescript"
    ? `import { readFileSync } from "node:fs";\n\nconst values = readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);\n// Implemente a solução e escreva o resultado em stdout.\nconsole.log(values.length);\n`
    : `import sys\n\nvalues = [int(value) for value in sys.stdin.read().split()]\n# Implemente a solução e escreva o resultado em stdout.\nprint(len(values))\n`;
}

function reference(runtime: Runtime): string {
  return runtime === "typescript"
    ? `import { readFileSync } from "node:fs";\nconst [n, ...values] = readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);\nconst counts = new Map<number, number>();\nfor (const value of values.slice(0, n)) counts.set(value, (counts.get(value) ?? 0) + 1);\nconsole.log([...counts.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => v + ":" + c).join(" "));\n`
    : `import sys\nfrom collections import Counter\ndata = [int(value) for value in sys.stdin.read().split()]\nn, values = data[0], data[1:]\ncounts = Counter(values[:n])\nprint(" ".join(f"{value}:{counts[value]}" for value in sorted(counts)))\n`;
}

function progressiveStarter(runtime: Runtime): string {
  return runtime === "typescript"
    ? `export class SequenceWorkbench {
  // Preserve o estado entre as chamadas e implemente um nível por vez.
  add(_value: number): number { return 0; }
  frequency(_value: number): number { return 0; }
  top(_limit: number): string[] { return []; }
  merge(_values: number[]): number { return 0; }
}
`
    : `class SequenceWorkbench:
    # Preserve o estado entre as chamadas e implemente um nível por vez.
    def add(self, value: int) -> int:
        return 0

    def frequency(self, value: int) -> int:
        return 0

    def top(self, limit: int) -> list[str]:
        return []

    def merge(self, values: list[int]) -> int:
        return 0
`;
}

function progressiveReference(runtime: Runtime): string {
  return runtime === "typescript"
    ? `export class SequenceWorkbench {
  private values: number[] = [];
  add(value: number): number { this.values.push(value); return this.values.length; }
  frequency(value: number): number { return this.values.filter((item) => item === value).length; }
  top(limit: number): string[] {
    const counts = new Map<number, number>();
    for (const value of this.values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, limit).map(([value, count]) => value + ":" + count);
  }
  merge(values: number[]): number { for (const value of values) this.values.push(value); return this.values.length; }
}
`
    : `from collections import Counter

class SequenceWorkbench:
    def __init__(self):
        self.values: list[int] = []

    def add(self, value: int) -> int:
        self.values.append(value)
        return len(self.values)

    def frequency(self, value: int) -> int:
        return self.values.count(value)

    def top(self, limit: int) -> list[str]:
        counts = Counter(self.values)
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return [f"{value}:{count}" for value, count in ordered[:limit]]

    def merge(self, values: list[int]) -> int:
        self.values.extend(values)
        return len(self.values)
`;
}

export class LocalAiAdapter implements AiAuthoringAdapter {
  async create(input: Extract<ContentRequest, { mode: "create" }>, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    if (input.format === "progressive") return this.createProgressive(input, actor, id, now);
    const problem: ProblemDefinition = {
      schemaVersion: 1,
      id,
      version: 1,
      slug: `frequencias-${id.slice(0, 8)}`,
      title: "Frequências ordenadas",
      summary: `Questão ${input.difficulty} sobre contagem e ordenação, criada a partir do pedido: ${input.prompt.slice(0, 100)}.`,
      locale: "pt-BR",
      origin: "native",
      visibility: input.visibility,
      status: "validating",
      format: "classic",
      executionModel: "stdio",
      difficulty: input.difficulty,
      tags: ["hash map", "ordenação", "arrays"],
      stages: [{
        number: 1,
        points: 100,
        statementMd: "# Frequências ordenadas\n\nLeia `n` inteiros e imprima cada valor distinto, em ordem crescente, no formato `valor:frequência`. Separe os pares por espaço.\n\n## Entrada\n\nA primeira linha contém `n`; a segunda contém os valores.\n\n## Exemplo\n\nEntrada: `5\\n3 1 3 2 1`\n\nSaída: `1:2 2:1 3:2`."
      }],
      runtimes: [{ language: input.runtime, version: input.runtime === "typescript" ? "22.22.0" : "3.13.11", starterCode: starter(input.runtime), entrypoint: { kind: "stdio" } }],
      examples: [],
      limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
      provenance: { kind: "native", createdBy: actor.id, createdByHandle: actor.handle, assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
      createdAt: now,
      updatedAt: now
    };
    const bundle: JudgeBundle = {
      schemaVersion: 1,
      problemId: id,
      problemVersion: 1,
      visibleCases: [{ kind: "stdio", id: "example", name: "exemplo básico", stage: 1, stdin: "5\n3 1 3 2 1\n", expectedStdout: "1:2 2:1 3:2\n" }],
      hiddenCases: [{ kind: "stdio", id: "single", name: "um valor", stage: 1, stdin: "1\n9\n", expectedStdout: "9:1\n" }],
      referenceSolutions: { [input.runtime]: reference(input.runtime) }
    };
    return { problem, bundle };
  }

  private createProgressive(input: Extract<ContentRequest, { mode: "create" }>, actor: Actor, id: string, now: string): { problem: ProblemDefinition; bundle: JudgeBundle } {
    const topic = input.prompt.slice(0, 100);
    const problem: ProblemDefinition = {
      schemaVersion: 1,
      id,
      version: 1,
      slug: `oficina-de-sequencias-${id.slice(0, 8)}`,
      title: "Oficina de sequências",
      summary: `Questão progressiva ${input.difficulty} de estado, contagem e ordenação, criada a partir do pedido: ${topic}.`,
      locale: "pt-BR",
      origin: "native",
      visibility: input.visibility,
      status: "validating",
      format: "progressive",
      executionModel: "call-sequence",
      difficulty: input.difficulty,
      tags: ["estado", "hash map", "ordenação"],
      stages: [
        { number: 1, points: 150, statementMd: "# Nível 1 — Inserção\n\nImplemente `add(value)`. Guarde o valor e retorne a nova quantidade total de valores." },
        { number: 2, points: 150, statementMd: "# Nível 2 — Frequência\n\nImplemente `frequency(value)`, retornando quantas vezes o valor já foi inserido." },
        { number: 3, points: 150, statementMd: "# Nível 3 — Ranking\n\nImplemente `top(limit)`. Retorne até `limit` itens no formato `valor:frequência`, ordenados por frequência decrescente e, em empate, pelo valor crescente." },
        { number: 4, points: 150, statementMd: "# Nível 4 — Fusão\n\nImplemente `merge(values)`. Insira todos os valores de forma atômica e retorne o novo tamanho. As consultas anteriores devem refletir a fusão." }
      ],
      runtimes: [{
        language: input.runtime,
        version: input.runtime === "typescript" ? "22.22.0" : "3.13.11",
        starterCode: progressiveStarter(input.runtime),
        entrypoint: { kind: "class", symbol: "SequenceWorkbench", methodMap: {} }
      }],
      examples: [],
      limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
      provenance: { kind: "native", createdBy: actor.id, createdByHandle: actor.handle, assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
      createdAt: now,
      updatedAt: now
    };
    const makeCase = (idValue: string, name: string, stage: number, calls: Array<{ method: string; args: unknown[]; expected: unknown }>) => ({
      kind: "call-sequence" as const,
      id: idValue,
      name,
      stage,
      constructorArgs: [],
      calls
    });
    const bundle: JudgeBundle = {
      schemaVersion: 1,
      problemId: id,
      problemVersion: 1,
      visibleCases: [
        makeCase("visible-1", "inserções", 1, [{ method: "add", args: [3], expected: 1 }, { method: "add", args: [3], expected: 2 }]),
        makeCase("visible-2", "frequências", 2, [{ method: "add", args: [2], expected: 1 }, { method: "add", args: [7], expected: 2 }, { method: "add", args: [2], expected: 3 }, { method: "frequency", args: [2], expected: 2 }]),
        makeCase("visible-3", "ranking com desempate", 3, [{ method: "add", args: [4], expected: 1 }, { method: "add", args: [2], expected: 2 }, { method: "add", args: [4], expected: 3 }, { method: "add", args: [2], expected: 4 }, { method: "add", args: [9], expected: 5 }, { method: "top", args: [2], expected: ["2:2", "4:2"] }]),
        makeCase("visible-4", "fusão preserva consultas", 4, [{ method: "add", args: [5], expected: 1 }, { method: "merge", args: [[5, 1, 5]], expected: 4 }, { method: "frequency", args: [5], expected: 3 }, { method: "top", args: [2], expected: ["5:3", "1:1"] }])
      ],
      hiddenCases: [
        makeCase("hidden-empty", "limites vazios", 3, [{ method: "top", args: [3], expected: [] }, { method: "frequency", args: [99], expected: 0 }]),
        makeCase("hidden-tie", "ordenação completa", 4, [{ method: "merge", args: [[3, 1, 2, 3, 1, 2]], expected: 6 }, { method: "top", args: [10], expected: ["1:2", "2:2", "3:2"] }])
      ],
      referenceSolutions: { [input.runtime]: progressiveReference(input.runtime) }
    };
    return { problem, bundle };
  }

  async searchWeb(_prompt: string, runtime: Runtime): Promise<SearchCandidate[]> {
    return [{
      id: "external-project-euler",
      kind: "external_link",
      title: "Project Euler",
      summary: "Coleção externa de desafios matemáticos; o conteúdo permanece no site de origem.",
      url: "https://projecteuler.net/archives",
      sourceName: "Project Euler",
      runtime,
      importable: false
    }];
  }

  async importLicensed(_source: LicensedExerciseSource): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }> {
    throw new Error("A importação licenciada exige OPENAI_API_KEY para converter starter e testes ao formato do Silogium.");
  }
}
