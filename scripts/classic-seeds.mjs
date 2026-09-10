import { readFileSync } from "node:fs";
import { join } from "node:path";

const generatedAt = "2026-09-10T12:00:00.000Z";
const stdioCase = (id, name, stdin, expectedStdout) => ({ kind: "stdio", id, name, stage: 1, stdin, expectedStdout });
const packagesInput = (target, volumes) => `${volumes.length} ${target}\n${volumes.join(" ")}\n`;
const intervalsInput = (intervals) => `${intervals.length}\n${intervals.map((pair) => pair.join(" ")).join("\n")}\n`;
const graphInput = (n, source, target, edges) => `${n} ${edges.length} ${source} ${target}\n${edges.map((pair) => pair.join(" ")).join("\n")}\n`;

// These are public learning fixtures, including the large boundary cases.
// Expected values below are fixed/closed-form, never obtained from a reference solution.
function casesFor(slug) {
  switch (slug) {
    case "pacotes-complementares": return [
      stdioCase("arrival-tie", "Desempate pelo segundo índice e depois pelo primeiro", packagesInput(10, [1, 4, 4, 6, 9, 6]), "2 4\n"),
      stdioCase("no-reuse", "Um pacote não pode ser usado duas vezes", packagesInput(8, [4, 1, 2]), "-1\n"),
      stdioCase("empty", "Nenhum pacote", "0 0\n", "-1\n"),
      stdioCase("single", "Um único pacote de volume zero", packagesInput(0, [0]), "-1\n"),
      stdioCase("zero-pair", "Volumes iguais em posições distintas", packagesInput(0, [0, 0, 0, 0]), "1 2\n"),
      stdioCase("absent", "Não existe par complementar", packagesInput(7, [1, 2, 3, 8]), "-1\n"),
      stdioCase("original-order", "Preserva os índices anteriores à ordenação", packagesInput(10, [8, 1, 6, 4, 2, 9]), "3 4\n"),
      stdioCase("first-index", "Preserva a primeira ocorrência do complemento", packagesInput(9, [2, 2, 2, 7]), "1 4\n"),
      stdioCase("numeric-boundary", "Volumes e alvo nos limites numéricos", packagesInput(2_000_000_000, [0, 1_000_000_000, 1_000_000_000]), "2 3\n"),
      stdioCase("whitespace", "Leitura independente de quebras de linha", " \t3\t5\r\n2\n0\t3 \n", "1 3\n"),
      stdioCase("maximum-size", "100000 pacotes; primeiro par somente ao final", packagesInput(199_997, Array.from({ length: 100_000 }, (_, i) => i)), "99999 100000\n")
    ];
    case "janelas-de-manutencao": return [
      stdioCase("touching", "Intervalos fora de ordem e contíguos", intervalsInput([[5, 8], [0, 2], [2, 5], [12, 14]]), "10 8\n"),
      stdioCase("nested", "Repetições e intervalos contidos não somam tempo", intervalsInput([[2, 9], [4, 5], [2, 9], [3, 7]]), "7 7\n"),
      stdioCase("empty", "Nenhuma manutenção", "0\n", "0 0\n"),
      stdioCase("single", "Uma janela com duração, não contagem de pontos", intervalsInput([[2, 3]]), "1 1\n"),
      stdioCase("numeric-boundary", "Uma janela cobre todo o domínio permitido", intervalsInput([[0, 1_000_000_000]]), "1000000000 1000000000\n"),
      stdioCase("overlaps", "Três blocos separados e sobreposições parciais", intervalsInput([[0, 3], [2, 5], [7, 9], [8, 12], [20, 21]]), "11 5\n"),
      stdioCase("bridge", "Uma manutenção conecta três janelas", intervalsInput([[0, 1], [4, 5], [8, 10], [1, 8]]), "10 10\n"),
      stdioCase("same-start", "Mesmo início não pode reduzir o fim da união", intervalsInput([[5, 6], [5, 15], [5, 8], [14, 20]]), "15 15\n"),
      stdioCase("last-longest", "A última janela precisa ser contabilizada", intervalsInput([[0, 1], [9, 10], [20, 40]]), "22 20\n"),
      stdioCase("whitespace", "Leitura independente de quebras de linha", " 2\r\n7\t9\n0 7\t", "9 9\n"),
      stdioCase("maximum-size", "100000 intervalos disjuntos em ordem decrescente", intervalsInput(Array.from({ length: 100_000 }, (_, i) => [2 * (99_999 - i), 2 * (99_999 - i) + 1])), "100000 1\n")
    ];
    case "rotas-da-estacao": {
      // 32 layers of two stations: 2^32 shortest routes, length 33.
      const layered = [[1, 2], [1, 3]];
      for (let k = 1; k < 32; k += 1) {
        for (const u of [2 * k, 2 * k + 1]) for (const v of [2 * k + 2, 2 * k + 3]) layered.push([u, v]);
      }
      layered.push([64, 66], [65, 66]);
      return [
        stdioCase("four-routes", "Quatro rotas mínimas de três trechos", graphInput(6, 1, 6, [[1, 2], [1, 3], [2, 4], [2, 5], [3, 4], [3, 5], [4, 6], [5, 6]]), "3 4\n"),
        stdioCase("unreachable", "Destino em outro componente", graphInput(4, 1, 4, [[1, 2]]), "-1 0\n"),
        stdioCase("single-station", "Uma estação e rota vazia", graphInput(1, 1, 1, []), "0 1\n"),
        stdioCase("same-station", "Origem igual ao destino em uma rede com ciclos", graphInput(4, 3, 3, [[1, 2], [2, 3], [3, 1], [3, 4]]), "0 1\n"),
        stdioCase("no-edges", "Estações isoladas sem ligações", graphInput(2, 1, 2, []), "-1 0\n"),
        stdioCase("reverse", "As ligações funcionam nos dois sentidos", graphInput(4, 4, 1, [[1, 2], [2, 3], [3, 4]]), "3 1\n"),
        stdioCase("same-layer", "Aresta na mesma camada não aumenta a contagem", graphInput(4, 1, 4, [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4]]), "2 2\n"),
        stdioCase("shortcut", "Rotas mais longas não entram na contagem", graphInput(5, 1, 5, [[1, 2], [2, 5], [1, 3], [3, 4], [4, 5], [1, 5]]), "1 1\n"),
        stdioCase("late-parent", "Todos os pais da camada contribuem para o destino", graphInput(5, 2, 4, [[2, 1], [1, 4], [2, 3], [3, 4], [2, 5], [5, 4]]), "2 3\n"),
        stdioCase("modulo", "Contagem excede 32 bits antes de aplicar o módulo", graphInput(66, 1, 66, layered), "33 294967268\n"),
        stdioCase("whitespace", "Leitura independente de quebras de linha", " 3\t2 3 1\r\n1\t2\n2 3  \n", "2 1\n"),
        stdioCase("maximum-size", "Cadeia de 100000 estações sem recursão", graphInput(100_000, 100_000, 1, Array.from({ length: 99_999 }, (_, i) => [i + 1, i + 2])), "99999 1\n")
      ];
    }
    default: throw new Error(`Fixtures clássicas ausentes: ${slug}`);
  }
}

export function buildClassicSeeds(root) {
  const registry = JSON.parse(readFileSync(join(root, "content/problems/classic-registry.json"), "utf8"));
  return registry.map((item) => ({
    problem: {
      schemaVersion: 1,
      id: item.id,
      version: 1,
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      locale: "pt-BR",
      origin: "native",
      visibility: "public",
      status: "published",
      format: "classic",
      executionModel: "stdio",
      difficulty: item.difficulty,
      tags: item.tags,
      metadata: item.metadata,
      stages: [{ number: 1, statementMd: readFileSync(join(root, "questions/classic", item.slug, "STATEMENT.md"), "utf8"), points: 100 }],
      runtimes: [
        { language: "typescript", version: "22.22.0", starterCode: readFileSync(join(root, "solutions/typescript", `${item.slug}.ts`), "utf8"), entrypoint: { kind: "stdio" } },
        { language: "python", version: "3.13.11", starterCode: readFileSync(join(root, "solutions/python", `${item.slug}.py`), "utf8"), entrypoint: { kind: "stdio" } }
      ],
      examples: item.examples,
      limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
      provenance: { kind: "native", createdBy: "system", createdByHandle: "silogium", assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
      createdAt: generatedAt,
      updatedAt: generatedAt
    },
    bundle: { schemaVersion: 1, problemId: item.id, problemVersion: 1, visibleCases: casesFor(item.slug), hiddenCases: [], referenceSolutions: {} }
  }));
}
