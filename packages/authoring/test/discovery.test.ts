import { describe, expect, it, vi } from "vitest";
import { buildCandidateMetadata, type Actor, type ContentRequest, type ProblemDefinition } from "@silogium/core";
import { MemoryAuthoringRepository, ProblemAuthoringModule, type AiAuthoringAdapter, type GeneratedPackage, type LicensedSourceAdapter, type SearchCandidate } from "../src/index.js";

const owner: Actor = { id: "discovery-owner", handle: "owner", role: "user" };
const other: Actor = { id: "discovery-other", handle: "other", role: "user" };
const admin: Actor = { id: "discovery-admin", handle: "admin", role: "admin" };
const createInput = (): Extract<ContentRequest, { mode: "create" }> => ({
  mode: "create", prompt: "Quero praticar trie de prefixos", runtime: "typescript",
  format: "classic", difficulty: "medium", visibility: "private"
});

function fixture(actor = owner, patch: Partial<ProblemDefinition> = {}): GeneratedPackage {
  const id = crypto.randomUUID();
  const problem: ProblemDefinition = {
    schemaVersion: 1, id, version: 1, slug: `trie-${id}`, title: "Trie de índices lexicográficos",
    summary: "Estruture autocomplete e busca por prefixos usando trie.", locale: "pt-BR", origin: "native",
    visibility: "private", status: "validated", format: "classic", executionModel: "stdio", difficulty: "medium",
    tags: ["trie", "autocomplete"], stages: [{ number: 1, statementMd: "Implemente um trie com consultas por prefixos.", points: 100 }],
    runtimes: [{ language: "typescript", version: "22.22.0", starterCode: "// starter-private-sentinel", entrypoint: { kind: "stdio" } }],
    examples: [], limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
    provenance: { kind: "native", createdBy: actor.id, createdByHandle: actor.handle, assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
    createdAt: "2026-09-09T12:00:00.000Z", updatedAt: "2026-09-09T12:00:00.000Z", ...patch
  };
  return {
    problem,
    bundle: {
      schemaVersion: 1, problemId: problem.id, problemVersion: problem.version, visibleCases: [],
      hiddenCases: [{ kind: "stdio", id: "hidden-private-sentinel", name: "Oculto", stage: 1, stdin: "segredo", expectedStdout: "resposta-secreta" }],
      referenceSolutions: { typescript: "// reference-private-sentinel" }
    },
    validation: { valid: true, checks: [] }
  };
}

function external(patch: Partial<SearchCandidate> = {}): SearchCandidate {
  const candidate: SearchCandidate = {
    id: "external-trie", kind: "external_link", title: "Trie com consultas de prefixos",
    summary: "Pratique tries e busca por prefixos na plataforma original.", url: "https://example.org/trie",
    sourceName: "Example", runtime: "typescript", importable: false, ...patch
  };
  return { ...candidate, metadata: buildCandidateMetadata(candidate) };
}

function setup(licensed: LicensedSourceAdapter[] = []) {
  const repository = new MemoryAuthoringRepository();
  // These tests isolate discovery from the production seed catalog.
  vi.spyOn(repository, "listCatalog").mockResolvedValue([]);
  const create = vi.fn<AiAuthoringAdapter["create"]>(async (_input, actor) => fixture(actor, { title: "Trie compacta alternativa", summary: "Uma nova variação original de prefixos com trie compacta." }));
  const searchWeb = vi.fn<AiAuthoringAdapter["searchWeb"]>(async () => []);
  const ai: AiAuthoringAdapter = { create, searchWeb, importLicensed: vi.fn(async () => fixture()) };
  const beforeAi = vi.fn(async (_actor: Actor) => {});
  const validator = { validate: vi.fn(async () => ({ valid: true, checks: [] })) };
  const module = new ProblemAuthoringModule(repository, ai, licensed, validator, false, beforeAi);
  return { repository, create, searchWeb, beforeAi, validator, module };
}

describe("descoberta e confirmação de autoria", () => {
  it("revalida snapshots antes de confirmar e não consome cota para dados inválidos", async () => {
    const { repository, module, create, beforeAi } = setup();
    const id = crypto.randomUUID();
    await repository.saveJob({ id, actorId: owner.id, status: "needs_confirmation", createdAt: new Date().toISOString(), request: { ...createInput(), prompt: "x" }, result: { kind: "recommendations", candidates: [] } });
    await expect(module.confirmCreation(id, owner)).rejects.toThrow();
    expect((await repository.getJob(id))?.status).toBe("needs_confirmation");
    expect(create).not.toHaveBeenCalled();
    expect(beforeAi).not.toHaveBeenCalled();
  });

  it("falha de um conector não esconde os resultados já conhecidos", async () => {
    const { repository, module } = setup([{ search: async () => { throw new Error("Fonte indisponível"); } }]);
    await repository.saveExternalCandidates(owner, [external()]);
    const { jobId } = await module.request({ mode: "search", prompt: "trie de prefixos", runtime: "typescript" }, owner);
    const job = await repository.getJob(jobId);
    expect(job).toMatchObject({ status: "completed", error: expect.stringMatching(/fonte licenciada não respondeu/i), result: { kind: "search", candidates: [expect.objectContaining({ title: "Trie com consultas de prefixos" })] } });
  });

  it("recomenda uma questão existente sem chamar IA, fonte externa ou cota", async () => {
    const licensedSearch = vi.fn(async () => [external()]);
    const { repository, module, create, searchWeb, beforeAi } = setup([{ search: licensedSearch }]);
    const existing = fixture();
    await repository.savePackage(existing);
    const { jobId } = await module.request(createInput(), owner);
    const job = await module.getJob(jobId, owner);
    expect(job?.status).toBe("needs_confirmation");
    expect(job?.result?.kind).toBe("recommendations");
    if (job?.result?.kind !== "recommendations") throw new Error("Recomendações ausentes");
    expect(job.result.candidates).toEqual([expect.objectContaining({ id: existing.problem.id, metadata: expect.any(Object), matchReasons: expect.any(Array) })]);
    expect(create).not.toHaveBeenCalled();
    expect(searchWeb).not.toHaveBeenCalled();
    expect(licensedSearch).not.toHaveBeenCalled();
    expect(beforeAi).not.toHaveBeenCalled();
  });

  it("cria diretamente quando não há correspondência e persiste metadados", async () => {
    const { repository, module, create, beforeAi } = setup();
    const { jobId } = await module.request(createInput(), owner);
    const job = await module.getJob(jobId, owner);
    expect(job?.status).toBe("completed");
    expect(create).toHaveBeenCalledTimes(1);
    expect(beforeAi).toHaveBeenCalledExactlyOnceWith(owner);
    if (job?.result?.kind !== "create") throw new Error("Criação ausente");
    expect(job.result.package.problem.metadata?.concepts).toContain("trie");
    const saved = await repository.getPackageById(job.result.package.problem.id, owner);
    expect(saved?.problem.metadata).toEqual(job.result.package.problem.metadata);
  });

  it("confirma exatamente o pedido salvo e gera só uma vez sob chamadas concorrentes e retries", async () => {
    const { repository, module, create, beforeAi } = setup();
    await repository.savePackage(fixture());
    const input = createInput();
    const original = structuredClone(input);
    const { jobId } = await module.request(input, owner);
    input.prompt = "Este texto foi editado depois do pedido";
    const observedJob = await repository.getJob(jobId);
    if (!observedJob || observedJob.request.mode !== "create") throw new Error("Job ausente");
    observedJob.request.prompt = "Este clone também não deve alterar o pedido salvo";
    let resolveGeneration!: (value: GeneratedPackage) => void;
    create.mockImplementationOnce(() => new Promise((resolve) => { resolveGeneration = resolve; }));
    const confirmations = [module.confirmCreation(jobId, owner), module.confirmCreation(jobId, owner), module.confirmCreation(jobId, owner)];
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(await module.confirmCreation(jobId, owner)).toEqual({ jobId });
    expect(create.mock.calls[0]?.[0]).toEqual(original);
    resolveGeneration(fixture(owner, { title: "Trie compacta nova", summary: "Uma nova variante com compressão de prefixos." }));
    expect(await Promise.all(confirmations)).toEqual([{ jobId }, { jobId }, { jobId }]);
    expect(await module.confirmCreation(jobId, owner)).toEqual({ jobId });
    expect((await repository.getJob(jobId))?.status).toBe("completed");
    expect(create).toHaveBeenCalledTimes(1);
    expect(beforeAi).toHaveBeenCalledTimes(1);
  });

  it("não permite que outro usuário ou administrador confirme o pedido", async () => {
    const { repository, module, create, beforeAi } = setup();
    await repository.savePackage(fixture());
    const { jobId } = await module.request(createInput(), owner);
    await expect(module.confirmCreation(jobId, other)).rejects.toThrow(/não encontrado/i);
    await expect(module.confirmCreation(jobId, admin)).rejects.toThrow(/não encontrado/i);
    expect((await repository.getJob(jobId))?.status).toBe("needs_confirmation");
    expect(create).not.toHaveBeenCalled();
    expect(beforeAi).not.toHaveBeenCalled();
  });

  it("trata falha de cota após confirmação sem chamar IA nem permitir replay", async () => {
    const { repository, module, create, beforeAi } = setup();
    await repository.savePackage(fixture());
    const { jobId } = await module.request(createInput(), owner);
    beforeAi.mockRejectedValueOnce(new Error("Cota diária encerrada"));
    await module.confirmCreation(jobId, owner);
    expect(await repository.getJob(jobId)).toMatchObject({ status: "failed", error: "Cota diária encerrada" });
    expect(create).not.toHaveBeenCalled();
    expect(beforeAi).toHaveBeenCalledTimes(1);
    await expect(module.confirmCreation(jobId, owner)).rejects.toThrow(/não aguarda confirmação/i);
    expect(beforeAi).toHaveBeenCalledTimes(1);
  });

  it("recupera links próprios para busca e criação e não envia código, fixtures ou enunciados à IA", async () => {
    const { repository, module, create, searchWeb } = setup();
    await repository.saveExternalCandidates(owner, [external()]);
    await repository.saveExternalCandidates(other, [external({ title: "Trie secreta de outra pessoa", url: "https://other.example/trie" })]);
    await repository.savePackage(fixture());
    await module.request({ mode: "search", prompt: "praticar trie de prefixos", runtime: "typescript" }, owner);
    const searchContext = searchWeb.mock.calls[0]?.[3];
    expect(searchContext?.candidates).toContainEqual(expect.objectContaining({ title: "Trie com consultas de prefixos", metadata: expect.objectContaining({ concepts: expect.arrayContaining(["trie"]) }) }));
    const { jobId } = await module.request(createInput(), owner);
    await module.confirmCreation(jobId, owner);
    const context = create.mock.calls[0]?.[2];
    expect(context?.candidates).toContainEqual(expect.objectContaining({ url: "https://example.org/trie", kind: "external_link" }));
    expect(JSON.stringify(context)).not.toMatch(/secreta de outra|other\.example|starter-private-sentinel|reference-private-sentinel|hidden-private-sentinel|resposta-secreta|statementMd|starterCode|referenceSolutions/);
  });

  it("isola links em cache inclusive para administradores", async () => {
    const { repository, module, create } = setup();
    await repository.saveExternalCandidates(owner, [external()]);
    expect(await repository.listExternalCandidates(other)).toEqual([]);
    expect(await repository.listExternalCandidates(admin)).toEqual([]);
    const ownerJob = await module.request(createInput(), owner);
    expect((await repository.getJob(ownerJob.jobId))?.status).toBe("needs_confirmation");
    const otherJob = await module.request(createInput(), admin);
    expect((await repository.getJob(otherJob.jobId))?.status).toBe("completed");
    expect(create.mock.calls[0]?.[2]?.candidates).toEqual([]);
  });

  it("descarta URLs inseguras e impede a IA de inventar licença ou uma questão local", async () => {
    const { repository, module, searchWeb } = setup();
    searchWeb.mockResolvedValue([
      external({ url: "javascript:alert(1)" }),
      external({ url: "data:text/html,unsafe" }),
      external({ url: "https://user:secret@example.org/trie" }),
      external({ kind: "licensed_import", sourceName: "Exercism", licenseSpdx: "MIT", importable: true, url: "https://github.com/exercism/typescript/tree/main/exercises/practice/trie?utm_source=chat#solution" }),
      external({ kind: "catalog", url: "https://example.org/fake-local", importable: true })
    ]);
    const { jobId } = await module.request({ mode: "search", prompt: "trie de prefixos", runtime: "typescript" }, owner);
    const job = await repository.getJob(jobId);
    if (job?.result?.kind !== "search") throw new Error("Busca ausente");
    expect(job.result.candidates).toHaveLength(2);
    expect(job.result.candidates.every((candidate) => candidate.kind === "external_link" && !candidate.importable && !candidate.licenseSpdx)).toBe(true);
    expect(job.result.candidates.some((candidate) => candidate.url === "https://github.com/exercism/typescript/tree/main/exercises/practice/trie")).toBe(true);
    expect(await repository.listCatalog()).toEqual([]);
    expect(await repository.listExternalCandidates(owner)).toHaveLength(2);
  });

  it("deduplica URLs canônicas sem perder suporte a outra linguagem", async () => {
    const { repository, module, searchWeb } = setup();
    searchWeb.mockResolvedValue([external({ url: "https://example.org/trie?utm_source=first&id=17#details" }), external({ url: "https://example.org/trie?id=17&fbclid=second" })]);
    await module.request({ mode: "search", prompt: "trie de prefixos", runtime: "typescript" }, owner);
    await module.request({ mode: "search", prompt: "trie de prefixos", runtime: "python" }, owner);
    const saved = await repository.listExternalCandidates(owner);
    expect(saved).toHaveLength(2);
    expect(saved.map((candidate) => candidate.runtime).sort()).toEqual(["python", "typescript"]);
    expect(saved.every((candidate) => candidate.url === "https://example.org/trie?id=17")).toBe(true);
    expect(saved.every((candidate) => !candidate.matchReasons && candidate.similarity === undefined)).toBe(true);
  });

  it("mantém a atribuição do conector licenciado acima de resultado web duplicado", async () => {
    const candidate = external({ kind: "licensed_import", sourceName: "Exercism", licenseSpdx: "MIT", importable: true, url: "https://github.com/exercism/typescript/tree/main/exercises/practice/trie" });
    const { repository, module, searchWeb } = setup([{ search: vi.fn(async () => [candidate]) }]);
    searchWeb.mockResolvedValue([external({ url: `${candidate.url}?utm_source=web` })]);
    const { jobId } = await module.request({ mode: "search", prompt: "trie de prefixos", runtime: "typescript" }, owner);
    const job = await repository.getJob(jobId);
    if (job?.result?.kind !== "search") throw new Error("Busca ausente");
    expect(job.result.candidates).toEqual([expect.objectContaining({ kind: "licensed_import", sourceName: "Exercism", licenseSpdx: "MIT", importable: true })]);
    expect(await repository.listExternalCandidates(owner)).toEqual([expect.objectContaining({ kind: "licensed_import", licenseSpdx: "MIT" })]);
  });

  it("usa resultados já disponíveis se a pesquisa web falhar", async () => {
    const { repository, module, searchWeb } = setup();
    await repository.saveExternalCandidates(owner, [external()]);
    searchWeb.mockRejectedValueOnce(new Error("Web indisponível"));
    const { jobId } = await module.request({ mode: "search", prompt: "trie de prefixos", runtime: "typescript" }, owner);
    const job = await repository.getJob(jobId);
    expect(job).toMatchObject({ status: "completed", error: expect.stringMatching(/não respondeu/i) });
    if (job?.result?.kind !== "search") throw new Error("Busca ausente");
    expect(job.result.candidates).toHaveLength(1);
  });

  it("oferece a versão pública para terceiros e somente a própria revisão elegível para o autor", async () => {
    const repository = new MemoryAuthoringRepository();
    const first = fixture(owner, { visibility: "public", status: "published" });
    await repository.savePackage(first);
    const revision = structuredClone(first);
    revision.problem.version = 2;
    revision.problem.title = "Trie revisada ainda não publicada";
    revision.bundle.problemVersion = 2;
    await repository.saveRevision(revision, owner);
    const rejected = fixture(owner, { title: "Trie recusada", summary: "Uma variante rejeitada para verificar isolamento editorial.", status: "rejected" });
    const unlisted = fixture(owner, { title: "Trie não listada", summary: "Uma variante não listada exclusivamente para o seu autor.", visibility: "unlisted" });
    await repository.savePackage(rejected);
    await repository.savePackage(unlisted);
    const own = await repository.listDiscoveryProblems(owner);
    expect(own.find((problem) => problem.id === first.problem.id)).toMatchObject({ version: 2, title: revision.problem.title });
    expect(own.some((problem) => problem.id === rejected.problem.id)).toBe(false);
    expect(own.some((problem) => problem.id === unlisted.problem.id)).toBe(true);
    for (const actor of [other, admin]) {
      const discoverable = await repository.listDiscoveryProblems(actor);
      expect(discoverable.find((problem) => problem.id === first.problem.id)).toMatchObject({ version: 1, title: first.problem.title });
      expect(discoverable.some((problem) => problem.id === unlisted.problem.id || problem.id === rejected.problem.id)).toBe(false);
    }
  });
});
