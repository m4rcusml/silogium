import { describe, expect, it } from "vitest";
import { buildCandidateMetadata, buildProblemMetadata, canonicalExternalUrl, discoveryLabel, DiscoveryMetadataSchema, ProblemDefinitionSchema, rankSimilarCandidates, seedProblems, type DiscoveryCandidate, type DiscoveryMetadata } from "../src/index.js";

function candidate(title: string, summary: string, extra: Partial<DiscoveryCandidate> = {}) {
  return { id: title, title, summary, runtime: "typescript" as const, ...extra };
}

const priority = candidate("Priority Queue", "Schedule jobs using a priority queue with deterministic ordering.", { format: "progressive", difficulty: "medium" });

describe("metadados de descoberta", () => {
  it("mantém definições legadas válidas sem migração obrigatória", () => {
    for (const problem of seedProblems) {
      expect(ProblemDefinitionSchema.parse(problem)).toEqual(problem);
      expect(DiscoveryMetadataSchema.safeParse(buildProblemMetadata(problem)).success).toBe(true);
    }
  });

  it("normaliza conceitos PT/EN com acentos e pontuação", () => {
    const local = buildCandidateMetadata(candidate("Fila de prioridades", "Use dicionários, busca em largura e programação dinâmica."));
    const english = buildCandidateMetadata(candidate("Priority Queue", "Use a hashmap, BFS and dynamic programming."));
    for (const concept of ["priority-queue", "hash-map", "bfs", "dynamic-programming"]) {
      expect(local.concepts).toContain(concept);
      expect(english.concepts).toContain(concept);
    }
    expect(buildCandidateMetadata(candidate("Cache LRU", "Janela deslizante e recursão."))).toMatchObject({ concepts: expect.arrayContaining(["cache", "lru", "sliding-window", "recursion"]), inferred: true });
  });

  it("usa apenas descrições públicas, nunca starter, exemplos ou referências", () => {
    const problem = structuredClone(seedProblems[0]!);
    problem.runtimes[0]!.starterCode = "// priorityqueue bfs supersecreto";
    problem.examples = [{ secret: "supersecreto dfs" }];
    const metadata = buildProblemMetadata(problem);
    expect(metadata.concepts).not.toContain("bfs");
    expect(metadata.concepts).not.toContain("dfs");
    expect(metadata.keywords).not.toContain("supersecreto");
    expect(metadata.runtimes).toEqual(["typescript", "python"]);
    expect(metadata.topics).toEqual(["logistics"]);
  });

  it("preserva metadados válidos normalizados sem duplicar, não altera o original", () => {
    const metadata = buildCandidateMetadata(priority);
    const original = candidate("Fila", "Agende tarefas com prioridade.", { metadata });
    const copy = structuredClone(original);
    const result = buildCandidateMetadata(original);
    expect(original).toEqual(copy);
    expect(result.concepts.filter((term) => term === "priority-queue")).toHaveLength(1);
    expect(result.concepts).not.toContain("priority queue");
    expect(buildCandidateMetadata({ ...original, metadata: result })).toEqual(result);
  });

  it("recalcula metadados locais sem perpetuar conceitos, temas ou habilidades da revisão anterior", () => {
    const original = structuredClone(seedProblems[0]!);
    original.metadata = buildProblemMetadata(original);
    expect(original.metadata.topics).toContain("logistics");
    const revision = {
      ...original,
      title: "Cache LRU",
      summary: "Implemente um cache LRU para armazenar pares de chave e valor.",
      tags: ["cache", "hash-map"],
      stages: original.stages.map((stage) => ({ ...stage, statementMd: "Implemente um cache LRU usando um dicionário." }))
    };
    const metadata = buildProblemMetadata(revision);
    expect(metadata.concepts).toEqual(["hash-map", "cache", "lru"]);
    expect(metadata.concepts).not.toContain("sorting");
    expect(metadata.topics).not.toContain("logistics");
    expect(metadata.skills).not.toContain("scheduling");
    expect(metadata.keywords).not.toContain("armarios");
    expect(revision.metadata).toEqual(original.metadata);
  });

  it("exibe rótulos PT-BR legíveis para conceitos, habilidades e temas", () => {
    expect(discoveryLabel("hash-map")).toBe("mapas e dicionários");
    expect(discoveryLabel("priority-queue")).toBe("filas de prioridade");
    expect(discoveryLabel("state-management")).toBe("gerenciamento de estado");
    expect(discoveryLabel("logistics")).toBe("logística");
    expect(discoveryLabel("conceito-personalizado")).toBe("conceito personalizado");
  });

  it("limita termos, rejeita hints malformados e não confia em proveniência inventada", () => {
    const manyWords = Array.from({ length: 100 }, (_, index) => `chavetermo${index}`).join(" ");
    const result = buildCandidateMetadata(candidate(manyWords, "x".repeat(300), { metadata: { schemaVersion: 999, licenseSpdx: "MIT" } as unknown as DiscoveryMetadata }));
    expect(result.keywords).toHaveLength(32);
    expect(result.keywords.every((term) => term.length <= 64)).toBe(true);
    expect(result).not.toHaveProperty("licenseSpdx");
    expect(DiscoveryMetadataSchema.safeParse({ ...result, topics: Array(17).fill("topic") }).success).toBe(false);
    expect(DiscoveryMetadataSchema.safeParse({ ...result, skills: ["x".repeat(65)] }).success).toBe(false);
  });

  it("não infere formato e dificuldade externos a partir da pergunta do usuário", () => {
    const result = rankSimilarCandidates({ prompt: "fila de prioridade", runtime: "typescript", format: "progressive", difficulty: "hard" }, [{ ...priority, format: undefined, difficulty: undefined }]);
    expect(result[0]?.metadata).toMatchObject({ format: "unknown", difficulty: "unknown" });
  });
});

describe("ranking de similaridade", () => {
  it("encontra sinônimos entre idiomas e explica os conceitos", () => {
    const matches = rankSimilarCandidates({ prompt: "Quero uma questão com fila de prioridade e agendamento de jobs.", runtime: "typescript" }, [priority]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(priority.id);
    expect(matches[0]?.similarity).toBeGreaterThan(40);
    expect(matches[0]?.matchReasons.join(" ")).toContain("filas de prioridade");
  });

  it("usa o conceito para encontrar domínio diferente sem confundir contexto com linguagem", () => {
    const support = candidate("Triagem hospitalar", "Organize pacientes em uma priority queue.");
    const unrelated = candidate("Reservas de salas", "Implemente um sistema de reservas em TypeScript.");
    expect(rankSimilarCandidates({ prompt: "fila de prioridade para chamados", runtime: "typescript" }, [support, unrelated]).map((item) => item.id)).toEqual([support.id]);
  });

  it("não recomenda nada por palavras genéricas, linguagem, formato ou dificuldade", () => {
    const generic = candidate("Sistema de exercícios", "Implemente uma solução usando TypeScript com dados de entrada e saída.", { format: "progressive", difficulty: "medium" });
    expect(rankSimilarCandidates({ prompt: "Quero criar uma nova questão progressiva em TypeScript de dificuldade média para treinar.", runtime: "typescript", format: "progressive", difficulty: "medium" }, [generic, priority])).toEqual([]);
    expect(rankSimilarCandidates({ prompt: "Quero uma questão de pilha com operações.", runtime: "typescript" }, [priority, generic])).toEqual([]);
    expect(rankSimilarCandidates({ prompt: "cache lru", runtime: "typescript" }, [priority])).toEqual([]);
  });

  it("formato e dificuldade só melhoram a posição de resultados já relevantes", () => {
    const candidates = [
      candidate("A fila", "Priority queue", { format: "classic", difficulty: "easy" }),
      candidate("Z fila", "Priority queue", { format: "progressive", difficulty: "medium" }),
      candidate("Reservas", "Reservas de coworking", { format: "progressive", difficulty: "medium" })
    ];
    expect(rankSimilarCandidates({ prompt: "priority queue", runtime: "typescript", format: "progressive", difficulty: "medium" }, candidates).map((item) => item.title)).toEqual(["Z fila", "A fila"]);
    expect(rankSimilarCandidates({ prompt: "priority queue", runtime: "python" }, candidates)).toEqual([]);
  });

  it("mantém a ordem estável e preserva campos extras e listas originais", () => {
    const candidates = [candidate("B", "HashMap dictionary"), candidate("A", "HashMap dictionary")];
    const original = structuredClone(candidates);
    expect(rankSimilarCandidates({ prompt: "dicionário", runtime: "typescript" }, candidates).map((item) => item.id)).toEqual(["A", "B"]);
    expect(candidates).toEqual(original);
  });

  it("recupera assuntos reais das sementes sem fabricar pilhas ou cache", () => {
    const candidates = seedProblems.map((problem) => ({ ...candidate(problem.title, problem.summary), slug: problem.slug, metadata: buildProblemMetadata(problem) }));
    const search = (prompt: string) => rankSimilarCandidates({ prompt, runtime: "typescript" }, candidates);
    expect(search("quero uma questão progressiva de reservas e cancelamentos em coworking")[0]?.slug).toBe("reservas-de-coworking");
    expect(search("rede de armários de encomendas")[0]?.slug).toBe("rede-de-armarios");
    expect(search("uma questão de ordenação").length).toBeGreaterThan(0);
    expect(search("fila de prioridade e agendamento de jobs")[0]?.slug).toBe("fazenda-de-builds");
    expect(search("fila de prioridade")).toEqual([]);
    expect(search("pilha com operações")).toEqual([]);
    expect(search("cache lru")).toEqual([]);
  });
});

describe("identidade canônica de links externos", () => {
  it("remove fragmento/rastreamento sem perder parâmetros semânticos ou caixa do path", () => {
    expect(canonicalExternalUrl("https://EXAMPLE.com/Practice/One?lang=ts&utm_source=google&b=2&fbclid=id&a=1#statement")).toBe("https://example.com/Practice/One?a=1&b=2&lang=ts");
    expect(canonicalExternalUrl("https://example.com/?gclid=123&UTM_campaign=test&level=4")).toBe("https://example.com/?level=4");
    expect(canonicalExternalUrl("https://example.com/p?a=2&a=1")).toBe("https://example.com/p?a=2&a=1");
  });

  it("recusa protocolos não web, URLs inválidas e credenciais embutidas", () => {
    for (const value of ["javascript:alert(1)", "file:///tmp/test", "data:text/plain,test", "/relative", "nada", "https://user:pass@example.com", "https://user@example.com"]) {
      expect(canonicalExternalUrl(value)).toBeNull();
    }
    expect(canonicalExternalUrl("http://example.com/test")).toBe("http://example.com/test");
  });
});
