import { afterEach, describe, expect, it, vi } from "vitest";
import type { Actor, ContentRequest } from "@silogium/core";
import { AuthoringWorker, ExercismAdapter, LocalAiAdapter, MemoryAuthoringQueue, MemoryAuthoringRepository, MemoryConversationRepository,
  PermanentAuthoringError, ProblemAuthoringModule, ProblemEditorial, type AiAuthoringAdapter, type AuthoringJob, type GeneratedPackage, type JobLease, type JobOutcome, type ValidationReport } from "../src/index.js";
import { mockSnapshot } from "./fixtures/exercism-source.js";
import { AiProviderError } from "../src/groq-transport.js";
import { aiStep } from "../src/ai-work.js";

const actor: Actor = { id: "31000000-0000-4000-8000-000000000001", handle: "owner", role: "user" };
const other: Actor = { id: "31000000-0000-4000-8000-000000000002", handle: "other", role: "user" };
const input: Extract<ContentRequest, { mode: "create" }> = { mode: "create", prompt: "trie compacto lexicográfico", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "private" };
async function fixture(): Promise<GeneratedPackage> {
  const value = await new LocalAiAdapter().create(input, actor);
  value.problem.status = "validated";
  value.bundle.referenceSolutions.typescript = "PRIVATE_REFERENCE_SENTINEL";
  value.bundle.hiddenCases[0]!.id = "PRIVATE_HIDDEN_SENTINEL";
  return { ...value, validation: { valid: true, checks: [] } };
}
function setup() {
  let now = Date.parse("2026-09-10T12:00:00Z");
  const repository = new MemoryAuthoringRepository();
  vi.spyOn(repository, "listCatalog").mockResolvedValue([]);
  const conversations = new MemoryConversationRepository();
  const reserve = vi.fn(async () => true);
  const queue = new MemoryAuthoringQueue(repository, conversations, { now: () => now, reserveAi: reserve });
  const ai = {
    create: vi.fn<AiAuthoringAdapter["create"]>(fixture),
    searchWeb: vi.fn<AiAuthoringAdapter["searchWeb"]>(async () => []),
    importLicensed: vi.fn<AiAuthoringAdapter["importLicensed"]>(fixture),
    refine: vi.fn<NonNullable<AiAuthoringAdapter["refine"]>>(async (request) => ({ problem: { ...request.problem, title: "Refinado pelo worker" }, bundle: request.bundle })),
    repair: vi.fn<NonNullable<AiAuthoringAdapter["repair"]>>(async (_input, _actor, previous) => previous)
  };
  const validator = { validate: vi.fn<() => Promise<ValidationReport>>(async () => ({ valid: true, checks: [] })) };
  const editorial = new ProblemEditorial(repository, validator);
  const module = new ProblemAuthoringModule(repository, ai, [new ExercismAdapter()], validator, false, undefined, conversations, editorial, queue);
  const worker = () => new AuthoringWorker(queue, (lease, work) => module.processQueuedJob(lease, work), { workerId: "test-worker", leaseSeconds: 30 });
  return { repository, conversations, queue, reserve, ai, validator, editorial, module, worker, advance: (ms: number) => { now += ms; } };
}
const job = (id = crypto.randomUUID()): AuthoringJob => ({ id, actorId: actor.id, request: input, status: "running", createdAt: "2026-09-10T12:00:00Z" });
const outcome = (lease: JobLease): JobOutcome => ({ job: { ...lease.job, status: "completed", result: { kind: "search", candidates: [] } }, effects: {} });
afterEach(() => vi.restoreAllMocks());

describe("autoria durável pelo mesmo módulo", () => {
  it("retoma a fase privada após 429 sem gastar tentativas nem cobrar outra operação", async () => {
    const s = setup(); const definition = vi.fn(async () => ({ rules: "private" })); let calls = 0;
    s.ai.create.mockImplementation(async () => {
      await aiStep("definition", "same-request", definition);
      await aiStep("code", "same-request", async () => {
        if (++calls <= 4) throw new AiProviderError("rate_limit", true, 65000);
        return { code: "private" };
      });
      return fixture();
    });
    const requested = await s.module.request(input, actor);
    for (let n = 0; n < 4; n++) {
      expect(await s.worker().runOnce()).toBe("retry");
      expect((await s.module.getJob(requested.jobId, actor))?.progress?.phase).toBe("waiting");
      expect(await s.worker().runOnce()).toBe("idle"); s.advance(65001);
    }
    expect(await s.worker().runOnce()).toBe("completed");
    expect(definition).toHaveBeenCalledOnce(); expect(s.reserve).toHaveBeenCalledOnce();
    expect(JSON.stringify(await s.module.getJob(requested.jobId, other))).not.toContain("private");
  });

  it("falha de configuração não é repetida pelo worker", async () => {
    const s = setup(); s.ai.create.mockRejectedValue(new AiProviderError("configuration"));
    const requested = await s.module.request(input, actor);
    expect(await s.worker().runOnce()).toBe("retry"); s.advance(90000);
    expect(await s.worker().runOnce()).toBe("idle");
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("failed");
    expect(s.ai.create).toHaveBeenCalledOnce();
  });
  it("retorna sem IA e só processa quando um worker reivindica o job", async () => {
    const s = setup();
    const requested = await s.module.request(input, actor);
    expect(s.ai.create).not.toHaveBeenCalled(); expect(s.reserve).not.toHaveBeenCalled();
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("running");
    expect(await s.module.getJob(requested.jobId, other)).toBeNull();
    expect(await s.worker().runOnce()).toBe("completed");
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("completed");
    expect((await s.repository.listForActor(actor))).toHaveLength(1);
    expect(await s.worker().runOnce()).toBe("idle");
    expect(s.reserve).toHaveBeenCalledOnce();
  });

  it("opt-out falha antes de criar conversa, job ou consumir cota", async () => {
    const s = setup();
    const module = new ProblemAuthoringModule(s.repository, s.ai, [], s.validator, false, undefined, s.conversations, undefined, s.queue, "Autoria desabilitada");
    await expect(module.request(input, actor)).rejects.toThrow("desabilitada");
    await expect(module.confirmCreation(crypto.randomUUID(), actor)).rejects.toThrow("desabilitada");
    expect((await s.conversations.list(actor)).items).toEqual([]);
    expect(await s.queue.claim("worker", 30)).toBeNull(); expect(s.reserve).not.toHaveBeenCalled();
  });

  it("retoma checkpoints após falha de commit sem repetir geração, validação ou cota", async () => {
    const s = setup();
    await s.module.request(input, actor);
    const finish = s.queue.finish.bind(s.queue);
    vi.spyOn(s.queue, "finish").mockRejectedValueOnce(new Error("Banco temporariamente offline")).mockImplementation(finish);
    expect(await s.worker().runOnce()).toBe("retry");
    expect((await s.repository.listForActor(actor))).toHaveLength(0);
    expect(await s.worker().runOnce()).toBe("idle"); s.advance(10_001);
    expect(await s.worker().runOnce()).toBe("completed");
    expect(s.ai.create).toHaveBeenCalledOnce(); expect(s.validator.validate).toHaveBeenCalledOnce(); expect(s.reserve).toHaveBeenCalledOnce();
    expect((await s.repository.listForActor(actor))).toHaveLength(1);
  });

  it("resposta perdida depois do commit não duplica conteúdo nem reverte o resultado", async () => {
    const s = setup(); const requested = await s.module.request(input, actor);
    const finish = s.queue.finish.bind(s.queue);
    vi.spyOn(s.queue, "finish").mockImplementationOnce(async (lease, result) => { await finish(lease, result); throw new Error("Resposta perdida"); });
    expect(await s.worker().runOnce()).toBe("lease_lost");
    expect(await s.worker().runOnce()).toBe("idle");
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("completed");
    expect(await s.repository.listForActor(actor)).toHaveLength(1);
  });

  it("worker antigo não salva após a retomada por outro processo", async () => {
    const s = setup(); await s.module.request(input, actor);
    let release!: (value: GeneratedPackage) => void;
    s.ai.create.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const slow = s.worker().runOnce();
    await vi.waitFor(() => expect(s.ai.create).toHaveBeenCalledOnce());
    s.advance(30_001);
    expect(await s.worker().runOnce()).toBe("completed");
    release(await fixture());
    expect(await slow).toBe("lease_lost");
    expect(await s.repository.listForActor(actor)).toHaveLength(1);
    expect(s.reserve).toHaveBeenCalledOnce();
  });

  it("confirmação concorrente mantém um job e só uma geração", async () => {
    const s = setup(); const existing = await fixture(); existing.problem.title = input.prompt;
    vi.spyOn(s.repository, "listDiscoveryProblems").mockResolvedValue([existing.problem]);
    const requested = await s.module.request(input, actor);
    await s.worker().runOnce();
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("needs_confirmation");
    expect(s.reserve).not.toHaveBeenCalled();
    await expect(s.module.confirmCreation(requested.jobId, other)).rejects.toThrow("não encontrado");
    await Promise.all(Array.from({ length: 12 }, () => s.module.confirmCreation(requested.jobId, actor)));
    const results = await Promise.all([s.worker().runOnce(), s.worker().runOnce()]);
    expect(results.sort()).toEqual(["completed", "idle"]);
    expect(s.ai.create).toHaveBeenCalledOnce(); expect(s.reserve).toHaveBeenCalledOnce();
    expect((await s.conversations.listTurns(requested.conversationId, actor)).items).toHaveLength(1);
  });

  it("não transforma system_error do judge em reprovação nem pede reparo da questão", async () => {
    const s = setup(); await s.module.request(input, actor);
    s.validator.validate.mockResolvedValueOnce({ valid: false, infrastructureError: true, checks: [] });
    expect(await s.worker().runOnce()).toBe("retry"); expect(await s.repository.listForActor(actor)).toHaveLength(0);
    s.advance(10_001); expect(await s.worker().runOnce()).toBe("completed");
    expect(s.ai.create).toHaveBeenCalledOnce(); expect(s.ai.repair).not.toHaveBeenCalled(); expect(s.validator.validate).toHaveBeenCalledTimes(2);
  });

  it("cota negada é terminal, não chama provedor e não fica rodando para sempre", async () => {
    const s = setup(); s.reserve.mockResolvedValue(false);
    const requested = await s.module.request(input, actor);
    expect(await s.worker().runOnce()).toBe("retry");
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("failed");
    s.advance(1_000_000); expect(await s.worker().runOnce()).toBe("idle"); expect(s.ai.create).not.toHaveBeenCalled();
  });

  it("importação mantém snapshot/licença e retoma sem buscar ou converter outra vez", async () => {
    const s = setup(); mockSnapshot();
    const source = new ExercismAdapter(); const load = vi.spyOn(source, "load");
    const module = new ProblemAuthoringModule(s.repository, s.ai, [source], s.validator, false, undefined, s.conversations, undefined, s.queue);
    await module.request({ mode: "import", sourceName: "Exercism", slug: "two-fer", runtime: "typescript" }, actor);
    const finish = s.queue.finish.bind(s.queue);
    vi.spyOn(s.queue, "finish").mockRejectedValueOnce(new Error("offline")).mockImplementation(finish);
    const worker = () => new AuthoringWorker(s.queue, (lease, work) => module.processQueuedJob(lease, work));
    expect(await worker().runOnce()).toBe("retry"); s.advance(10_001);
    expect(await worker().runOnce()).toBe("completed");
    expect(load).toHaveBeenCalledOnce(); expect(s.ai.importLicensed).toHaveBeenCalledOnce();
    const saved = (await s.repository.listForActor(actor))[0]!;
    expect(saved.problem.provenance).toMatchObject({ kind: "licensed_import", sourceName: "Exercism", licenseSpdx: "MIT", importedBy: actor.id });
    expect(saved.problem.visibility).toBe("private");
  });

  it("refinamento é commitado junto com o job; retry não incrementa a revisão duas vezes", async () => {
    const s = setup(); const source = await fixture(); await s.repository.savePackage(source);
    await s.module.request({ mode: "refine", slug: source.problem.slug, prompt: "Esclareça os requisitos", expectedRevision: 0 }, actor);
    const finish = s.queue.finish.bind(s.queue);
    vi.spyOn(s.queue, "finish").mockRejectedValueOnce(new Error("offline")).mockImplementation(finish);
    expect(await s.worker().runOnce()).toBe("retry"); expect(await s.repository.getEditorialRecord(source.problem.id)).toBeNull();
    s.advance(10_001); expect(await s.worker().runOnce()).toBe("completed");
    expect((await s.repository.getEditorialRecord(source.problem.id))?.revision).toBe(1); expect(s.ai.refine).toHaveBeenCalledOnce();
    expect((await s.repository.getPackageVersion(source.problem.id, 1, actor))?.problem.title).toBe(source.problem.title);
  });

  it("uma edição concorrente invalida refinamento antigo sem sobrescrevê-la", async () => {
    const s = setup(); const source = await fixture(); await s.repository.savePackage(source);
    const requested = await s.module.request({ mode: "refine", slug: source.problem.slug, prompt: "Melhore a clareza", expectedRevision: 0 }, actor);
    s.ai.refine.mockImplementationOnce(async (request) => {
      const draft = await s.editorial.open(source.problem.slug, actor);
      await s.editorial.saveDraft(source.problem.slug, actor, { expectedRevision: 0, content: { ...draft.problem, title: "Título editado pelo autor" }, visibleCases: draft.visibleCases });
      return { problem: { ...request.problem, title: "Refinamento obsoleto" }, bundle: request.bundle };
    });
    await s.worker().runOnce(); s.advance(10_001); await s.worker().runOnce(); s.advance(30_001); await s.worker().runOnce();
    expect((await s.module.getJob(requested.jobId, actor))?.status).toBe("failed");
    expect((await s.repository.getEditorialRecord(source.problem.id))?.package.problem.title).toBe("Título editado pelo autor");
    expect(s.ai.refine).toHaveBeenCalledOnce();
  });

  it("apagar conversa durante a fila não apaga questão nem ressuscita histórico", async () => {
    const s = setup(); const requested = await s.module.request(input, actor);
    await s.conversations.delete(requested.conversationId, actor);
    expect(await s.worker().runOnce()).toBe("completed");
    expect(await s.repository.listForActor(actor)).toHaveLength(1);
    expect((await s.conversations.list(actor)).items).toEqual([]);
  });
});

describe("leases, replay e limites", () => {
  it("claim concorrente não seleciona a mesma tarefa", async () => {
    const s = setup(); await s.queue.enqueue(job(), actor);
    const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => s.queue.claim(`worker-${i}`, 30)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it("enfileiramento idempotente rejeita outra identidade", async () => {
    const s = setup(); const value = job();
    await s.queue.enqueue(value, actor); await s.queue.enqueue(value, actor);
    await expect(s.queue.enqueue({ ...value, actorId: other.id }, other)).rejects.toThrow("identity");
    expect(await s.queue.claim("one", 30)).not.toBeNull(); expect(await s.queue.claim("two", 30)).toBeNull();
  });
  it.each(["heartbeat", "checkpoint", "finish", "retry"] as const)("%s rejeita token expirado mesmo antes de outra claim", async (action) => {
    const s = setup(); await s.queue.enqueue(job(), actor); const lease = (await s.queue.claim("one", 30))!;
    s.advance(30_000);
    const result = action === "heartbeat" ? await s.queue.heartbeat(lease, 30)
      : action === "checkpoint" ? await s.queue.checkpoint(lease, "generated", { secret: true })
      : action === "finish" ? await s.queue.finish(lease, outcome(lease)) : await s.queue.retry(lease, "late", false);
    expect(result).toBe(false);
  });
  it("heartbeat mantém o lease e checkpoints são first-write-wins privados", async () => {
    const s = setup(); const value = job(); await s.queue.enqueue(value, actor); const lease = (await s.queue.claim("one", 30))!;
    await s.queue.checkpoint(lease, "generated", { secret: "one" }); await s.queue.checkpoint(lease, "generated", { secret: "two" });
    s.advance(20_000); expect(await s.queue.heartbeat(lease, 30)).toBe(true); s.advance(20_000);
    expect(await s.queue.claim("two", 30)).toBeNull(); s.advance(10_001);
    const recovered = (await s.queue.claim("two", 30))!;
    expect(recovered.checkpoints).toEqual({ generated: { secret: "one" } });
    expect(JSON.stringify(await s.repository.getJob(value.id))).not.toContain("secret");
  });
  it("morte em todas as três tentativas termina em falha, não perde o job", async () => {
    const s = setup(); const value = job(); await s.queue.enqueue(value, actor);
    for (let attempt = 1; attempt <= 3; attempt++) { expect((await s.queue.claim("worker", 30))?.attempt).toBe(attempt); s.advance(30_001); }
    expect(await s.queue.claim("worker", 30)).toBeNull(); expect((await s.repository.getJob(value.id))?.status).toBe("failed");
  });
  it("mais de cem jobs são reivindicados sem truncar a fila", async () => {
    const s = setup();
    const ids = new Set<string>();
    for (let index = 0; index < 105; index++) { s.advance(60_001); await s.queue.enqueue(job(), actor); const lease = (await s.queue.claim("worker", 30))!; ids.add(lease.job.id); await s.queue.finish(lease, outcome(lease)); }
    expect(ids.size).toBe(105); expect(await s.queue.claim("worker", 30)).toBeNull();
  });
  it("erros permanentes não repetem o processamento", async () => {
    const s = setup(); const value = job(); await s.queue.enqueue(value, actor);
    const worker = new AuthoringWorker(s.queue, async () => { throw new PermanentAuthoringError("Não permitido"); });
    await worker.runOnce(); s.advance(40_000); expect(await worker.runOnce()).toBe("idle");
    expect((await s.repository.getJob(value.id))?.status).toBe("failed");
  });
  it("mensagem privada de erro do provedor não aparece no job", async () => {
    const s = setup(); const requested = await s.module.request(input, actor);
    s.ai.create.mockRejectedValue(new Error("Authorization: sk-PRIVATE-KEY request=PRIVATE_PROMPT"));
    await s.worker().runOnce(); s.advance(10_001); await s.worker().runOnce(); s.advance(30_001); await s.worker().runOnce();
    const saved = await s.module.getJob(requested.jobId, actor);
    expect(saved?.status).toBe("failed"); expect(saved?.error).not.toContain("PRIVATE"); expect(saved?.error).not.toContain("Authorization");
    expect(s.reserve).toHaveBeenCalledOnce();
  });
  it("reservas concorrentes da mesma tarefa compartilham a cota", async () => {
    const s = setup(); await s.queue.enqueue(job(), actor); const lease = (await s.queue.claim("worker", 30))!;
    expect(await Promise.all(Array.from({ length: 8 }, () => s.queue.reserveAi(lease)))).toEqual(Array(8).fill(true));
    expect(s.reserve).toHaveBeenCalledOnce();
  });
  it("admissão concorrente limita pendentes sem gerar conversas órfãs ou consumir IA", async () => {
    const s = setup();
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => s.module.request(input, actor)));
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(3);
    expect((await s.conversations.list(actor)).items).toHaveLength(3);
    expect(s.reserve).not.toHaveBeenCalled(); expect(s.ai.create).not.toHaveBeenCalled();
    await expect(s.module.request(input, other)).resolves.toHaveProperty("jobId");
  });
  it("dez admissões por minuto valem mesmo para jobs rapidamente concluídos", async () => {
    const s = setup();
    for (let count = 0; count < 10; count++) {
      await s.module.request(input, actor); const lease = (await s.queue.claim("worker", 30))!; await s.queue.finish(lease, outcome(lease));
    }
    await expect(s.module.request(input, actor)).rejects.toThrow("dez pedidos por minuto");
    expect((await s.conversations.list(actor)).items).toHaveLength(10); expect(s.reserve).not.toHaveBeenCalled();
    s.advance(60_001); await expect(s.module.request(input, actor)).resolves.toHaveProperty("jobId");
  });
  it("confirmação sem task durável devolve erro recuperável, nunca falso sucesso", async () => {
    const s = setup(); const legacy = { ...job(), status: "needs_confirmation" as const };
    await s.repository.saveJob(legacy);
    await expect(s.module.confirmCreation(legacy.id, actor)).rejects.toThrow("anterior à fila");
    expect(await s.queue.claim("worker", 30)).toBeNull(); expect(s.ai.create).not.toHaveBeenCalled();
  });
  it("recomendações aguardando escolha não aprisionam vagas, mas confirmar obedece limite", async () => {
    const s = setup(); const existing = await fixture(); existing.problem.title = input.prompt;
    vi.spyOn(s.repository, "listDiscoveryProblems").mockResolvedValue([existing.problem]);
    const waiting: string[] = [];
    for (let count = 0; count < 3; count++) { const created = await s.module.request(input, actor); waiting.push(created.jobId); await s.worker().runOnce(); }
    await Promise.all(Array.from({ length: 3 }, () => s.module.request(input, actor)));
    await expect(s.module.confirmCreation(waiting[0]!, actor)).rejects.toThrow("três pedidos pendentes");
    expect((await s.module.getJob(waiting[0]!, actor))?.status).toBe("needs_confirmation"); expect(s.reserve).not.toHaveBeenCalled();
  });
});
