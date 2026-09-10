import type { Actor } from "@silogium/core";
import type { Conversation, ConversationTurn } from "./conversation.js";
import type { EditorialRecord } from "./editorial-types.js";
import type { AuthoringJob, GeneratedPackage, SearchCandidate } from "./types.js";

/** Server-only. Checkpoints may contain references, source snapshots and hidden tests. */
export type JobLease = {
  job: AuthoringJob; actor: Actor; token: string; attempt: number;
  confirmed: boolean; checkpoints: Record<string, unknown>;
};
export type JobEffects = {
  package?: GeneratedPackage;
  editorial?: { record: EditorialRecord; expectedRevision: number };
  candidates?: SearchCandidate[];
};
export type JobOutcome = { job: AuthoringJob; effects: JobEffects; turn?: ConversationTurn };

/** All writes are fenced by the lease token. finish commits effects + terminal job atomically. */
export interface AuthoringQueue {
  enqueue(job: AuthoringJob, actor: Actor, turn?: ConversationTurn, newConversation?: Conversation): Promise<void>;
  confirm(jobId: string, actorId: string): Promise<boolean>;
  claim(workerId: string, leaseSeconds: number): Promise<JobLease | null>;
  heartbeat(lease: JobLease, leaseSeconds: number): Promise<boolean>;
  checkpoint(lease: JobLease, key: string, value: unknown): Promise<boolean>;
  reserveAi(lease: JobLease): Promise<boolean>;
  finish(lease: JobLease, outcome: JobOutcome): Promise<boolean>;
  retry(lease: JobLease, error: string, permanent: boolean): Promise<boolean>;
}

export class JobLeaseLost extends Error { constructor() { super("O processamento foi retomado por outro worker."); } }
export class PermanentAuthoringError extends Error {}
function safeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof PermanentAuthoringError && message.startsWith("Sua cota diária")) return "Sua cota diária de IA terminou. Tente novamente amanhã.";
  if (/rascunho mudou|editorial revision conflict/i.test(message)) return "O rascunho mudou durante o processamento. Reabra a versão atual antes de pedir outro refinamento.";
  // Provider/transport errors can contain headers, prompts, URLs or response bodies.
  return "Não foi possível concluir o processamento. Confira suas questões e tente novamente; se persistir, procure o administrador.";
}
export type JobWork = {
  effects: JobEffects;
  step<T>(key: string, compute: () => Promise<T>): Promise<T>;
  beforeAi(): Promise<void>;
};
export type JobProcessor = (lease: JobLease, work: JobWork) => Promise<JobOutcome>;

/** One bounded claim; hosting/polling is outside this module. No provider dependency. */
export class AuthoringWorker {
  constructor(private readonly queue: AuthoringQueue, private readonly process: JobProcessor,
    private readonly options: { workerId?: string; leaseSeconds?: number; heartbeatMs?: number } = {}) {}

  async runOnce(): Promise<"idle" | "completed" | "retry" | "lease_lost"> {
    const seconds = this.options.leaseSeconds ?? 120;
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 900) throw new Error("Lease deve ter entre 30 e 900 segundos.");
    const heartbeatMs = this.options.heartbeatMs ?? Math.floor(seconds * 1_000 / 3);
    if (heartbeatMs < 10 || heartbeatMs >= seconds * 1_000) throw new Error("Heartbeat deve ocorrer antes da expiração do lease.");
    const lease = await this.queue.claim(this.options.workerId ?? `worker-${crypto.randomUUID()}`, seconds);
    if (!lease) return "idle";
    let lost = false;
    let beating = false;
    const assertLease = () => { if (lost) throw new JobLeaseLost(); };
    const timer = setInterval(() => {
      if (beating || lost) return;
      beating = true;
      this.queue.heartbeat(lease, seconds).then((ok) => { if (!ok) lost = true; }, () => { lost = true; }).finally(() => { beating = false; });
    }, heartbeatMs);
    timer.unref?.();
    const work: JobWork = {
      effects: {},
      step: async <T>(key: string, compute: () => Promise<T>): Promise<T> => {
        assertLease();
        if (Object.hasOwn(lease.checkpoints, key)) return structuredClone(lease.checkpoints[key]) as T;
        const value = await compute();
        assertLease();
        if (!await this.queue.checkpoint(lease, key, value)) throw new JobLeaseLost();
        lease.checkpoints[key] = structuredClone(value);
        return structuredClone(value);
      },
      beforeAi: async () => {
        assertLease();
        if (!await this.queue.reserveAi(lease)) throw new PermanentAuthoringError("Sua cota diária de IA terminou. Tente novamente amanhã.");
      }
    };
    try {
      const outcome = await this.process(lease, work);
      assertLease();
      return await this.queue.finish(lease, outcome) ? "completed" : "lease_lost";
    } catch (error) {
      if (lost || error instanceof JobLeaseLost) return "lease_lost";
      // A lost response after COMMIT is harmless: retry's old token cannot change the terminal job.
      return await this.queue.retry(lease, safeFailure(error), error instanceof PermanentAuthoringError) ? "retry" : "lease_lost";
    } finally { clearInterval(timer); }
  }
}
