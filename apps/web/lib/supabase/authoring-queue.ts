import { createHash } from "node:crypto";
import { buildProblemMetadata, problemFingerprint, type Actor } from "@silogium/core";
import { persistableExternalCandidate, type AuthoringJob, type AuthoringQueue, type Conversation, type ConversationTurn, type JobLease, type JobOutcome } from "@silogium/authoring";
import { createSupabaseAdminClient } from "./admin";

type QueueClient = { rpc(name: string, args: { p_action: string; p_payload: unknown }): PromiseLike<{ data: unknown; error: { message: string } | null }> };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Private materials cross only service-role RPC, never PostgREST table/GraphQL reads. */
export class SupabaseAuthoringQueue implements AuthoringQueue {
  constructor(private readonly client: () => QueueClient | null = createSupabaseAdminClient) {}

  private async call<T>(action: string, payload: unknown): Promise<T> {
    const client = this.client();
    if (!client) throw new Error("Supabase de servidor não configurado para o worker.");
    const { data, error } = await client.rpc("authoring_queue", { p_action: action, p_payload: payload });
    if (error) throw new Error(`Fila de autoria indisponível (migração 202609090010): ${error.message}`);
    return data as T;
  }

  async enqueue(job: AuthoringJob, actor: Actor, turn?: ConversationTurn, newConversation?: Conversation) {
    await this.call("enqueue", { job, actorId: actor.id, turn, newConversation });
  }
  confirm(jobId: string, actorId: string) { return this.call<boolean>("confirm", { jobId, actorId }); }
  claim(workerId: string, leaseSeconds: number) { return this.call<JobLease | null>("claim", { workerId, leaseSeconds }); }
  heartbeat(lease: JobLease, leaseSeconds: number) { return this.call<boolean>("heartbeat", { jobId: lease.job.id, token: lease.token, leaseSeconds }); }
  checkpoint(lease: JobLease, key: string, value: unknown) { return this.call<boolean>("checkpoint", { jobId: lease.job.id, token: lease.token, key, value }); }
  reserveAi(lease: JobLease) { return this.call<boolean>("reserve_ai", { jobId: lease.job.id, token: lease.token }); }
  retry(lease: JobLease, error: string, permanent: boolean) { return this.call<boolean>("retry", { jobId: lease.job.id, token: lease.token, error, permanent }); }

  finish(lease: JobLease, raw: JobOutcome) {
    const outcome = structuredClone(raw);
    const value = outcome.effects.package;
    const prepared = value ? {
      ...value, problem: { ...value.problem, metadata: value.problem.metadata ?? buildProblemMetadata(value.problem) },
      fingerprint: problemFingerprint(value.problem), checksum: hash(JSON.stringify(value.bundle)),
      ...(value.accessKey ? { accessHash: hash(value.accessKey) } : {})
    } : undefined;
    // The full bundle belongs only in private tables. The job DTO remains safe even to its owner.
    const result = outcome.job.result;
    const safeResult = result?.kind === "create" ? { kind: "create", package: {
      problem: result.package.problem, validation: result.package.validation, accessKey: result.package.accessKey
    } } : result;
    return this.call<boolean>("finish", { jobId: lease.job.id, token: lease.token, outcome: {
      ...outcome, job: { ...outcome.job, result: safeResult }, effects: {
        ...outcome.effects, ...(prepared ? { package: prepared } : {}),
        ...(outcome.effects.candidates ? { candidates: outcome.effects.candidates.flatMap((candidate) => {
          const safe = persistableExternalCandidate(candidate); return safe ? [safe] : [];
        }) } : {})
      }
    } });
  }
}
