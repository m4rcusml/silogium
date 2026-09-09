import { describe, expect, it } from "vitest";
import { LocalAiAdapter, MemoryAuthoringRepository, ProblemAuthoringModule, StructuralProblemValidator } from "../src/index.js";

const actor = { id: "user-1", handle: "marcus", role: "user" as const };
const stranger = { id: "user-2", handle: "ana", role: "user" as const };
const admin = { id: "admin-1", handle: "admin", role: "admin" as const };

describe("ProblemAuthoringModule", () => {
  it("cria e valida um rascunho privado sem pesquisar a web", async () => {
    const module = new ProblemAuthoringModule(new MemoryAuthoringRepository(), new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "create", prompt: "uma questão sobre hash maps", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "private" }, actor);
    const job = await module.getJob(jobId, actor);
    expect(job?.status).toBe("completed");
    expect(job?.result?.kind).toBe("create");
    if (job?.result?.kind === "create") expect(job.result.package.problem.status).toBe("validated");
  });

  it("mantém links externos fora do catálogo", async () => {
    const module = new ProblemAuthoringModule(new MemoryAuthoringRepository(), new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "search", prompt: "problemas matemáticos", runtime: "python" }, actor);
    const job = await module.getJob(jobId, actor);
    if (job?.result?.kind !== "search") throw new Error("Resultado inesperado");
    expect(job.result.candidates.some((item) => item.kind === "external_link" && !item.importable)).toBe(true);
  });

  it("isola rascunhos privados do catálogo e de outros usuários", async () => {
    const repository = new MemoryAuthoringRepository();
    const module = new ProblemAuthoringModule(repository, new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "create", prompt: "uma pilha com operações", runtime: "python", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    const job = await module.getJob(jobId, actor);
    if (job?.result?.kind !== "create") throw new Error("Resultado inesperado");
    const problemId = job.result.package.problem.id;
    expect(await repository.getPackageBySlug(job.result.package.problem.slug, stranger)).toBeNull();
    expect(await repository.getPackageBySlug(job.result.package.problem.slug, actor)).not.toBeNull();
    expect((await repository.listCatalog()).some((problem) => problem.id === problemId && problem.status === "published")).toBe(false);
  });

  it("abre questões não listadas somente com a chave e nunca as mistura no catálogo", async () => {
    const repository = new MemoryAuthoringRepository();
    const module = new ProblemAuthoringModule(repository, new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "create", prompt: "uma fila de prioridade", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "unlisted" }, actor);
    const job = await module.getJob(jobId, actor);
    if (job?.result?.kind !== "create") throw new Error("Resultado inesperado");
    const generated = job.result.package;
    expect(generated.accessKey).toBeTruthy();
    expect(await repository.getPackageBySlug(generated.problem.slug, stranger)).toBeNull();
    expect(await repository.getPackageBySlug(generated.problem.slug, stranger, generated.accessKey)).not.toBeNull();
    expect((await repository.listCatalog()).some((problem) => problem.id === generated.problem.id && problem.status === "published")).toBe(false);
  });

  it("só inclui pedido público depois da aprovação administrativa", async () => {
    const repository = new MemoryAuthoringRepository();
    const module = new ProblemAuthoringModule(repository, new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "create", prompt: "um cache lru", runtime: "typescript", format: "progressive", difficulty: "hard", visibility: "public" }, actor);
    const job = await module.getJob(jobId, actor);
    if (job?.result?.kind !== "create") throw new Error("Resultado inesperado");
    const generated = job.result.package;
    expect(generated.problem.status).toBe("pending_review");
    expect((await repository.listCatalog()).some((problem) => problem.id === generated.problem.id && problem.status === "published")).toBe(false);
    await repository.moderate(generated.problem.id, "approve", admin);
    expect((await repository.listCatalog()).some((problem) => problem.id === generated.problem.id && problem.status === "published")).toBe(true);
  });

  it("bloqueia conteúdo duplicado pelo fingerprint", async () => {
    const repository = new MemoryAuthoringRepository();
    const module = new ProblemAuthoringModule(repository, new LocalAiAdapter(), [], new StructuralProblemValidator());
    const input = { mode: "create", prompt: "contagem determinística duplicada", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "private" } as const;
    await module.request(input, actor);
    const second = await module.request(input, actor);
    const job = await module.getJob(second.jobId, actor);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/duplicada/i);
  });

  it("permite rejeição somente por administrador e mantém a questão fora do catálogo", async () => {
    const repository = new MemoryAuthoringRepository();
    const module = new ProblemAuthoringModule(repository, new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "create", prompt: "fila com prioridades para revisão", runtime: "python", format: "classic", difficulty: "medium", visibility: "public" }, actor);
    const job = await module.getJob(jobId, actor);
    if (job?.result?.kind !== "create") throw new Error("Resultado inesperado");
    await expect(repository.moderate(job.result.package.problem.id, "reject", stranger)).rejects.toThrow(/administradores/i);
    const rejected = await repository.moderate(job.result.package.problem.id, "reject", admin, "Enunciado ambíguo");
    expect(rejected.problem.status).toBe("rejected");
    expect((await repository.listCatalog()).some((problem) => problem.id === rejected.problem.id && problem.status === "published")).toBe(false);
  });

  it("mantém a versão pública anterior enquanto uma alteração volta para revisão", async () => {
    const repository = new MemoryAuthoringRepository();
    const module = new ProblemAuthoringModule(repository, new LocalAiAdapter(), [], new StructuralProblemValidator());
    const { jobId } = await module.request({ mode: "create", prompt: "questão versionada de contagem", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "public" }, actor);
    const job = await module.getJob(jobId, actor);
    if (job?.result?.kind !== "create") throw new Error("Resultado inesperado");
    const first = await repository.moderate(job.result.package.problem.id, "approve", admin);
    const updatedAt = new Date(Date.now() + 1_000).toISOString();
    const revision = {
      ...first,
      problem: { ...first.problem, version: 2, title: "Frequências ordenadas revisada", status: "validating" as const, updatedAt },
      bundle: { ...first.bundle, problemVersion: 2 }
    };
    const saved = await module.revise(revision, actor);
    expect(saved.problem).toMatchObject({ version: 2, status: "validated" });
    expect((await repository.listCatalog()).find((problem) => problem.id === first.problem.id)).toMatchObject({ version: 1, title: first.problem.title });
    await module.requestPublication(first.problem.id, actor);
    await repository.moderate(first.problem.id, "approve", admin);
    expect((await repository.listCatalog()).find((problem) => problem.id === first.problem.id)).toMatchObject({ version: 2, title: "Frequências ordenadas revisada" });
    expect(first.problem.version).toBe(1);
  });
});
