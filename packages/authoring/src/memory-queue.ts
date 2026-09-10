import type { Actor } from "@silogium/core";
import type { Conversation, MemoryConversationRepository, ConversationTurn } from "./conversation.js";
import type { AuthoringQueue, JobLease, JobOutcome } from "./durable-jobs.js";
import type { MemoryAuthoringRepository } from "./repository.js";
import type { AuthoringJob } from "./types.js";

type Task = { job: AuthoringJob; actor: Actor; state: "queued" | "leased" | "waiting" | "done" | "failed" | "committing";
  attempt: number; token?: string; until: number; availableAt: number; admittedAt: number; confirmed: boolean; aiReserved: boolean; checkpoints: Record<string, unknown> };

/** Test/local adapter; intentionally not durable across process restarts. Hosted code uses PostgreSQL. */
export class MemoryAuthoringQueue implements AuthoringQueue {
  private tasks = new Map<string, Task>();
  private reservations = new Map<string, Promise<boolean>>();
  constructor(private readonly repository: MemoryAuthoringRepository, private readonly conversations: MemoryConversationRepository,
    private readonly options: { now?: () => number; reserveAi?: (actor: Actor) => Promise<boolean>; refundAi?: (actor: Actor, jobId: string) => Promise<void> } = {}) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  private active(lease: JobLease) {
    const task = this.tasks.get(lease.job.id);
    return task?.state === "leased" && task.token === lease.token && task.until > this.now() ? task : null;
  }
  async enqueue(job: AuthoringJob, actor: Actor, turn?: ConversationTurn, newConversation?: Conversation) {
    if (job.actorId !== actor.id) throw new Error("Job identity conflict.");
    const previous = this.tasks.get(job.id);
    if (previous) {
      if (previous.actor.id !== actor.id || JSON.stringify(previous.job.request) !== JSON.stringify(job.request)) throw new Error("Job identity conflict.");
      return;
    }
    const own = [...this.tasks.values()].filter((task) => task.actor.id === actor.id);
    if (own.filter((task) => ["queued", "leased", "committing"].includes(task.state)).length >= 3) throw new Error("Você já tem três pedidos pendentes. Conclua os anteriores antes de criar outro.");
    if (own.filter((task) => task.admittedAt > this.now() - 60_000).length >= 10) throw new Error("Limite de dez pedidos por minuto. Aguarde antes de tentar novamente.");
    if (newConversation) {
      if (job.request.conversationId !== newConversation.id) throw new Error("Conversa inválida.");
      this.conversations.createQueued(newConversation, actor);
    }
    this.tasks.set(job.id, { job: structuredClone(job), actor: structuredClone(actor), state: "queued", attempt: 0,
      until: 0, availableAt: this.now(), admittedAt: this.now(), confirmed: false, aiReserved: false, checkpoints: {} });
    await this.repository.saveJob(job);
    if (turn) await this.conversations.saveTurn(turn, actor);
  }
  async confirm(jobId: string, actorId: string) {
    const task = this.tasks.get(jobId);
    if (!task || task.actor.id !== actorId) return false;
    if (task.confirmed) return true;
    if (task.state !== "waiting" || task.job.status !== "needs_confirmation" || task.job.request.mode !== "create") return false;
    if ([...this.tasks.values()].filter((item) => item.actor.id === actorId && ["queued", "leased", "committing"].includes(item.state)).length >= 3) throw new Error("Você já tem três pedidos pendentes. Conclua os anteriores antes de confirmar outro.");
    Object.assign(task, { state: "queued", attempt: 0, confirmed: true, availableAt: this.now() });
    task.job = { ...task.job, status: "running", result: undefined, completedAt: undefined, error: undefined };
    await this.repository.saveJob(task.job);
    return true;
  }
  async claim(_workerId: string, leaseSeconds: number): Promise<JobLease | null> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900) throw new Error("Invalid lease.");
    for (const task of this.tasks.values()) {
      const eligible = task.state === "queued" && task.availableAt <= this.now() || task.state === "leased" && task.until <= this.now();
      if (!eligible) continue;
      if (task.attempt >= 3) {
        task.state = "failed"; task.checkpoints = {};
        task.job = { ...task.job, status: "failed", completedAt: new Date(this.now()).toISOString(), error: "O worker não concluiu o pedido após três tentativas." };
        await this.repository.saveJob(task.job);
        continue;
      }
      Object.assign(task, { state: "leased", token: crypto.randomUUID(), attempt: task.attempt + 1, until: this.now() + leaseSeconds * 1_000 });
      return structuredClone({ job: task.job, actor: task.actor, token: task.token!, attempt: task.attempt, confirmed: task.confirmed, checkpoints: task.checkpoints });
    }
    return null;
  }
  async heartbeat(lease: JobLease, seconds: number) {
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 900) throw new Error("Invalid lease.");
    const task = this.active(lease); if (!task) return false;
    task.until = this.now() + seconds * 1_000; return true;
  }
  async checkpoint(lease: JobLease, key: string, value: unknown) {
    const task = this.active(lease); if (!task) return false;
    if (!/^[a-z0-9-]{1,80}$/.test(key)) throw new Error("Invalid checkpoint.");
    if (!Object.hasOwn(task.checkpoints, key)) task.checkpoints[key] = structuredClone(value);
    return true;
  }
  async reserveAi(lease: JobLease) {
    const task = this.active(lease); if (!task) return false;
    if (task.aiReserved) return true;
    let pending = this.reservations.get(lease.job.id);
    if (!pending) {
      pending = this.options.reserveAi?.(task.actor) ?? Promise.resolve(true);
      this.reservations.set(lease.job.id, pending);
    }
    const allowed = await pending;
    if (!this.active(lease)) return false;
    if (allowed) task.aiReserved = true;
    else {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(this.now()));
      task.state = "queued"; task.token = undefined; task.until = 0;
      task.attempt = Math.max(0, task.attempt - 1);
      task.availableAt = Date.parse(`${day}T00:00:00-03:00`) + 86_400_000;
      this.reservations.delete(lease.job.id);
      task.job.progress = { phase: "waiting", reason: "quota", updatedAt: new Date(this.now()).toISOString(), retryAt: new Date(task.availableAt).toISOString() };
      task.job.error = "O pedido aguarda a renovação da cota à meia-noite de Brasília.";
      await this.repository.saveJob(task.job);
    }
    return allowed;
  }
  async finish(lease: JobLease, outcome: JobOutcome) {
    const task = this.active(lease); if (!task) return false;
    if (outcome.job.id !== task.job.id || outcome.job.actorId !== task.actor.id || !["completed", "needs_confirmation"].includes(outcome.job.status)) throw new Error("Invalid outcome.");
    task.state = "committing";
    try {
      this.repository.commitQueuedOutcome(outcome, task.actor);
      task.job = structuredClone(outcome.job);
      task.state = outcome.job.status === "needs_confirmation" ? "waiting" : "done";
      if (task.state === "done") task.checkpoints = {};
      // A test/local history adapter failure cannot roll back committed content or trigger duplication.
      if (outcome.turn) { try { await this.conversations.saveTurn(outcome.turn, task.actor); } catch { /* Job remains directly recoverable. */ } }
      return true;
    } catch (error) { task.state = "leased"; throw error; }
  }
  async progress(lease: JobLease, phase: import("./ai-work.js").AiPhase) {
    const task = this.active(lease); if (!task) return false;
    task.job.progress = { phase, updatedAt: new Date(this.now()).toISOString() };
    await this.repository.saveJob(task.job); return true;
  }
  async retry(lease: JobLease, error: string, permanent: boolean, options?: { deferMs?: number; refund?: boolean }) {
    const task = this.active(lease); if (!task) return false;
    const deferred = options?.deferMs && !permanent ? options.deferMs : 0;
    const terminal = permanent || !deferred && task.attempt >= 3;
    if (terminal && options?.refund && task.aiReserved) {
      await this.options.refundAi?.(task.actor, task.job.id);
      task.aiReserved = false;
    }
    if (deferred) task.attempt = Math.max(0, task.attempt - 1);
    task.state = terminal ? "failed" : "queued";
    task.availableAt = this.now() + (deferred || (task.attempt === 1 ? 10_000 : 30_000));
    if (terminal) task.checkpoints = {};
    task.job = { ...task.job, status: terminal ? "failed" : "running", error: terminal ? error.slice(0, 2_000) : "O processamento será retomado automaticamente.",
      ...(!terminal ? { progress: { phase: "waiting" as const, updatedAt: new Date(this.now()).toISOString(), retryAt: new Date(task.availableAt).toISOString() } } : {}),
      completedAt: terminal ? new Date(this.now()).toISOString() : undefined };
    await this.repository.saveJob(task.job);
    return true;
  }
}
