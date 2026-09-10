import { DiscoveryMetadataSchema, type DiscoveryMetadata, type ProblemDefinition, type ProblemFormat, type Runtime } from "./schemas.js";

/** Structural shape: callers retain their own catalog, attribution and access fields. */
export type DiscoveryCandidate = {
  title: string;
  summary: string;
  runtime: Runtime;
  format?: DiscoveryMetadata["format"];
  difficulty?: DiscoveryMetadata["difficulty"];
  metadata?: DiscoveryMetadata;
};

type Taxonomy = ReadonlyArray<readonly [key: string, label: string, aliases: readonly string[]]>;

const concepts: Taxonomy = [
  ["array", "arrays", ["array", "arrays", "vetor", "vetores", "lista", "listas", "list", "lists"]],
  ["hash-map", "mapas e dicionários", ["hash map", "hashmap", "hashmaps", "map", "maps", "mapa", "mapas", "dicionario", "dicionarios", "dictionary", "dictionaries", "dict", "tabela hash", "hash table"]],
  ["set", "conjuntos", ["set", "sets", "conjunto", "conjuntos", "hashset", "deduplicacao"]],
  ["queue", "filas", ["queue", "queues", "fila", "filas", "fifo"]],
  ["priority-queue", "filas de prioridade", ["priority queue", "priorityqueue", "fila prioridade", "fila de prioridade", "fila de prioridades", "filas de prioridade", "filas de prioridades", "heap", "heaps", "min heap", "max heap"]],
  ["stack", "pilhas", ["stack", "stacks", "pilha", "pilhas", "lifo"]],
  ["linked-list", "listas encadeadas", ["linked list", "linkedlist", "linked lists", "lista encadeada", "listas encadeadas", "lista ligada", "doubly linked"]],
  ["graph", "grafos", ["grafo", "grafos", "graph", "graphs", "vertices", "arestas", "shortest path", "caminho minimo"]],
  ["tree", "árvores", ["tree", "trees", "arvore", "arvores", "binary search tree", "bst"]],
  ["trie", "tries", ["trie", "tries", "arvore de prefixos", "prefix tree"]],
  ["bfs", "busca em largura", ["bfs", "breadth first", "busca em largura"]],
  ["dfs", "busca em profundidade", ["dfs", "depth first", "busca em profundidade"]],
  ["sorting", "ordenação", ["sorting", "sort", "sorted", "ordenacao", "ordenar", "ordenados", "ordenadas", "ranking", "rankeamento"]],
  ["binary-search", "busca binária", ["binary search", "busca binaria", "pesquisa binaria"]],
  ["dynamic-programming", "programação dinâmica", ["dynamic programming", "programacao dinamica", "memoization", "memoizacao", "tabulation"]],
  ["greedy", "algoritmos gulosos", ["greedy", "guloso", "gulosos", "gulosa"]],
  ["backtracking", "backtracking", ["backtracking", "retrocesso", "busca exaustiva"]],
  ["recursion", "recursão", ["recursion", "recursive", "recursao", "recursiva", "recursivo"]],
  ["sliding-window", "janela deslizante", ["sliding window", "slidingwindow", "janela deslizante", "janelas deslizantes"]],
  ["two-pointers", "dois ponteiros", ["two pointers", "two pointer", "dois ponteiros"]],
  ["prefix-sum", "somas de prefixos", ["prefix sum", "prefix sums", "soma prefixada", "somas prefixadas", "soma de prefixos", "somas de prefixos"]],
  ["cache", "cache", ["cache", "caching", "caches"]],
  ["lru", "cache LRU", ["lru", "least recently used", "menos recentemente usado", "menos recentemente utilizado"]],
  ["ttl", "expiração e TTL", ["ttl", "time to live", "expiracao", "expirar", "expirados", "expiration"]],
  ["string", "strings", ["string", "strings", "substring", "substrings", "palindromo", "palindromos", "palindrome", "anagrama", "anagram"]],
  ["matrix", "matrizes", ["matrix", "matrices", "matriz", "matrizes", "grid", "grids"]],
  ["interval", "intervalos", ["interval", "intervals", "intervalo", "intervalos", "sobreposicao", "overlap"]],
  ["union-find", "union-find", ["union find", "disjoint set", "conjuntos disjuntos"]]
];

const skills: Taxonomy = [
  ["state-management", "gerenciamento de estado", ["state management", "gerenciamento de estado", "estado em memoria", "in memory", "em memoria", "persistir estado", "manter estado"]],
  ["state-machine", "máquinas de estados", ["state machine", "maquina de estados", "transicao de estado", "transicoes de estado"]],
  ["object-oriented", "orientação a objetos", ["object oriented", "orientacao a objetos", "oop", "poo", "encapsulamento", "encapsulation", "classes"]],
  ["validation", "validação", ["validation", "validacao", "validar", "validacao de entradas", "input validation"]],
  ["history", "histórico e versões", ["history", "historico", "versionamento", "versioning", "versoes", "versions", "snapshot", "snapshots", "undo", "desfazer"]],
  ["scheduling", "agendamento", ["schedule", "scheduling", "scheduled", "scheduler", "agendamento", "agendamentos", "agendar", "escalonamento", "escalonar"]],
  ["transactions", "transações", ["transactions", "transaction", "transacoes", "transacao", "atomicidade", "atomicity", "rollback"]],
  ["pagination", "paginação", ["pagination", "paginacao", "paginar", "cursor"]],
  ["parsing", "parsing", ["parsing", "parser", "parse", "analisador sintatico", "tokenizacao", "tokenization"]],
  ["aggregation", "agregação", ["aggregation", "agregacao", "agregar", "agrupar", "grouping", "group by"]],
  ["optimization", "otimização", ["optimization", "otimizacao", "otimizar", "complexidade", "complexity"]]
];

const topics: Taxonomy = [
  ["banking", "sistemas bancários", ["bank", "banking", "bancario", "bancaria", "bancarios", "banco financeiro", "contas bancarias", "deposito", "depositos", "saque", "saldo", "transferencia", "transferencias", "wallet", "carteira digital"]],
  ["support", "atendimento e chamados", ["support ticket", "helpdesk", "chamado", "chamados", "atendimento", "central de suporte", "service desk"]],
  ["logistics", "logística", ["logistics", "logistica", "entrega", "entregas", "delivery", "deliveries", "encomenda", "encomendas", "armario", "armarios", "locker", "lockers", "frete", "shipment"]],
  ["booking", "reservas", ["reservation", "reservations", "reserva", "reservas", "booking", "bookings", "coworking", "sala", "salas", "room", "rooms"]],
  ["inventory", "estoque", ["inventory", "estoque", "warehouse", "armazem", "inventario"]],
  ["commerce", "comércio", ["commerce", "comercio", "loja", "store", "shopping", "carrinho", "checkout", "pedido", "pedidos", "order", "orders"]],
  ["social", "redes sociais", ["social network", "rede social", "redes sociais", "seguidores", "followers", "amizades", "friendship"]],
  ["filesystem", "arquivos e diretórios", ["file system", "filesystem", "sistema de arquivos", "arquivo", "arquivos", "diretorio", "diretorios", "directory", "directories"]],
  ["database", "bancos de dados", ["database", "banco de dados", "bancos de dados", "armazenamento", "key value", "chave valor", "registro", "registros"]],
  ["networking", "redes e tráfego", ["networking", "traffic", "trafego", "roteamento", "routing", "rate limiter", "rate limiting", "limitador de requisicoes", "http"]],
  ["games", "jogos", ["game", "games", "jogo", "jogos", "tabuleiro", "board", "xadrez", "chess"]],
  ["healthcare", "saúde", ["healthcare", "hospital", "hospitais", "paciente", "pacientes", "patient", "patients", "triagem"]],
  ["job-processing", "processamento de jobs", ["job", "jobs", "worker", "workers", "job processing", "background tasks", "tarefas em segundo plano", "fazenda de builds"]],
  ["text-processing", "processamento de texto", ["processamento de texto", "text processing", "editor de texto", "text editor", "autocomplete", "autocompletar"]]
];

const stopWords = new Set(`a ao aos as o os um uma uns umas de da das do dos e em no nos na nas com sem por para que quero queria gostaria precisa preciso crie criar cria gere gerar gerada gerado criada criado questao questoes exercicio exercicios desafio desafios problema problemas treinar treino treinamento praticar pratica resolver resolva solucao solucoes implementar implemente implementacao construir desenvolva desenvolvimento sistema sistemas use usar usando fazer faca faz feito sobre mais menos muito pouco apenas somente tambem pode podem deve devem tem ter seu sua seus suas este esta estes estas esse essa isso como qual quais cada entre ate atraves exemplo exemplos caso casos teste testes nivel niveis etapa etapas formato progressivo progressiva progressivas classico classica classicas facil medio media dificil basico basica iniciante avancado linguagem linguagens typescript javascript python ts py codigo entrada saida retorna retornar retorne funcao funcoes metodo metodos objeto objetos classe class function method input output return returns solution solutions problem problems challenge challenges exercise exercises create build implement implementation practice training train solve solving a an the with without of for on in by to from and or please new another similar question questions using use should must can that this these those is are be your more less only also example examples case cases test tests level levels stage stages format classic progressive easy medium hard beginner advanced language code i would like want me my asked required expected provided given dados data valor valores values value numero numeros number numbers nome name id verdadeiro falso true false null undefined todas todos todo toda qualquer quando se nao sim ja ainda cada once then if else all any`.split(/\s+/));

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function terms(value: string): string[] {
  return normalize(value).split(" ").filter((term) => term.length >= 3 && term.length <= 64 && !stopWords.has(term) && !/^\d+$/.test(term));
}

function infer(value: string, taxonomy: Taxonomy): string[] {
  const haystack = ` ${normalize(value)} `;
  const found = taxonomy.filter(([key, , aliases]) => [key, ...aliases].some((alias) => haystack.includes(` ${normalize(alias)} `))).map(([key]) => key);
  // Avoid matching an ordinary queue solely because "priority queue" contains "queue".
  return found.filter((key) => !(key === "queue" && found.includes("priority-queue")) && !(key === "array" && found.includes("linked-list")));
}

function bounded(values: readonly string[], maximum: number): string[] {
  return [...new Set(values.map((value) => value.trim().slice(0, 64)).filter(Boolean))].slice(0, maximum);
}

function customTerms(values: readonly string[], taxonomy: Taxonomy): string[] {
  return values.filter((value) => infer(value, taxonomy).length === 0).map((value) => normalize(value).replace(/ /g, "-"));
}

function metadataFor(text: string, candidate: { metadata?: DiscoveryMetadata; runtimes: Runtime[]; format?: DiscoveryMetadata["format"]; difficulty?: DiscoveryMetadata["difficulty"]; topicText?: string }): DiscoveryMetadata {
  const parsed = DiscoveryMetadataSchema.safeParse(candidate.metadata);
  const previous = parsed.success ? parsed.data : undefined;
  // Treat imported hints as data. Unknown fields (including invented provenance) never survive.
  const metadataText = [text, ...(previous?.concepts ?? []), ...(previous?.skills ?? []), ...(previous?.topics ?? []), ...(previous?.keywords ?? [])].join(" ");
  return {
    schemaVersion: 1,
    concepts: bounded([...infer(metadataText, concepts), ...customTerms(previous?.concepts ?? [], concepts)], 24),
    skills: bounded([...infer(metadataText, skills), ...customTerms(previous?.skills ?? [], skills)], 24),
    topics: bounded([...infer([candidate.topicText ?? text, ...(previous?.topics ?? [])].join(" "), topics), ...customTerms(previous?.topics ?? [], topics)], 16),
    keywords: bounded([...(previous?.keywords ?? []).flatMap(terms), ...terms(text)], 32),
    runtimes: [...new Set(candidate.runtimes)],
    format: candidate.format ?? previous?.format ?? "unknown",
    difficulty: candidate.difficulty ?? previous?.difficulty ?? "unknown",
    inferred: true
  };
}

/** Recompute local hints from current public content; old inferred metadata cannot survive revisions. */
export function buildProblemMetadata(problem: ProblemDefinition): DiscoveryMetadata {
  const description = [problem.title, problem.summary, ...problem.tags].join(" ");
  return metadataFor([description, ...problem.stages.map((stage) => stage.statementMd)].join(" "), {
    // Instructions saying "use this file" or "this method is called" are not the domain.
    topicText: description,
    runtimes: problem.runtimes.map((runtime) => runtime.language),
    format: problem.format,
    difficulty: problem.difficulty
  });
}

/** External descriptions only: does not fetch or copy an external statement. */
export function buildCandidateMetadata(candidate: DiscoveryCandidate): DiscoveryMetadata {
  return metadataFor(`${candidate.title} ${candidate.summary}`, {
    metadata: candidate.metadata,
    runtimes: [candidate.runtime],
    format: candidate.format,
    difficulty: candidate.difficulty
  });
}

function common(left: readonly string[], right: readonly string[]): string[] {
  const values = new Set(right);
  return left.filter((value) => values.has(value));
}

function labels(keys: readonly string[], taxonomy: Taxonomy): string {
  return keys.slice(0, 3).map((key) => taxonomy.find(([id]) => id === key)?.[1] ?? key).join(", ");
}

/** Human-readable PT-BR labels for metadata badges; unknown hints remain plain text. */
export function discoveryLabel(key: string): string {
  const normalized = normalize(key).replace(/ /g, "-");
  for (const taxonomy of [concepts, skills, topics]) {
    const term = taxonomy.find(([id]) => id === normalized);
    if (term) return term[1];
  }
  return key.trim().replace(/[-_]+/g, " ");
}

/** Deterministic 0–100 relevance. Format/difficulty only break ties after a content match. */
export function rankSimilarCandidates<T extends DiscoveryCandidate>(input: { prompt: string; runtime: Runtime; format?: ProblemFormat; difficulty?: ProblemDefinition["difficulty"] }, candidates: readonly T[]): Array<T & { metadata: DiscoveryMetadata; similarity: number; matchReasons: string[] }> {
  const query = metadataFor(input.prompt.slice(0, 2_000), { runtimes: [input.runtime], format: input.format, difficulty: input.difficulty });
  const results: Array<T & { metadata: DiscoveryMetadata; similarity: number; matchReasons: string[] }> = [];
  for (const candidate of candidates) {
    if (candidate.runtime !== input.runtime) continue;
    const metadata = buildCandidateMetadata(candidate);
    const matchedConcepts = common(query.concepts, metadata.concepts);
    const matchedSkills = common(query.skills, metadata.skills);
    const matchedTopics = common(query.topics, metadata.topics);
    const matchedKeywords = common(query.keywords, metadata.keywords);
    // Runtime, boilerplate, or a lone generic shared word cannot trigger creation confirmation.
    const meaningfulSkill = matchedSkills.length >= 2 || (matchedSkills.length === 1 && query.concepts.length === 0 && query.topics.length === 0);
    if (!matchedConcepts.length && !matchedTopics.length && !meaningfulSkill && matchedKeywords.length < 2) continue;
    const coverage = (matches: readonly string[], all: readonly string[]) => matches.length / Math.max(1, all.length);
    let similarity = 45 * coverage(matchedConcepts, query.concepts) + 18 * coverage(matchedSkills, query.skills) + 22 * coverage(matchedTopics, query.topics) + 10 * coverage(matchedKeywords, query.keywords);
    if (input.format && metadata.format === input.format) similarity += 3;
    if (input.difficulty && metadata.difficulty === input.difficulty) similarity += 2;
    const matchReasons: string[] = [];
    if (matchedConcepts.length) matchReasons.push(`Conceitos em comum: ${labels(matchedConcepts, concepts)}.`);
    if (matchedTopics.length) matchReasons.push(`Tema próximo: ${labels(matchedTopics, topics)}.`);
    if (matchedSkills.length) matchReasons.push(`Habilidades em comum: ${labels(matchedSkills, skills)}.`);
    if (!matchReasons.length) matchReasons.push(`Termos em comum: ${matchedKeywords.slice(0, 3).join(", ")}.`);
    if (input.format && metadata.format === input.format) matchReasons.push(input.format === "progressive" ? "Também é progressiva." : "Também é clássica.");
    results.push({ ...candidate, metadata, similarity: Math.min(100, Math.max(1, Math.round(similarity))), matchReasons });
  }
  return results.sort((left, right) => right.similarity - left.similarity || left.title.localeCompare(right.title, "pt-BR") || left.summary.localeCompare(right.summary, "pt-BR"));
}

/** Canonical identity for links; preserve semantic query parameters and path casing. */
export function canonicalExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}
