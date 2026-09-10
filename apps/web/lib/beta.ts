import type { Actor } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { wakeAuthoringWorker } from "./worker-wakeup";

export type BetaState = "pending" | "approved" | "rejected" | "revoked";
export type BetaStatus = {
  state: BetaState; isAdmin: boolean; dailyLimit: number | null;
  createdToday: number; reservedToday: number; remaining: number | null; resetsAt: string;
};
export type BetaParticipant = {
  userId: string; handle: string; state: BetaState; role: "user" | "admin";
  githubId: string | null; githubHandle: string | null;
  requestedAt: string; updatedAt: string;
};
export type BetaInvitation = { githubId: string; githubHandle: string; createdAt: string };
export type BetaMutation = { action: "approve" | "reject" | "revoke"; userId: string }
  | { action: "invite"; githubHandle: string } | { action: "revoke_invite"; githubId: string };

export class BetaAccessError extends Error {
  readonly statusCode = 403;
  readonly code = "beta_access_required";
  constructor(readonly betaStatus: BetaStatus) {
    super(betaStatus.state === "revoked" ? "Seu acesso ao beta foi revogado. Consulte o administrador."
      : betaStatus.state === "rejected" ? "Seu pedido de acesso ao beta não foi aprovado."
      : "Seu acesso ao beta aguarda aprovação. Você pode explorar o catálogo enquanto isso.");
  }
}

const local = globalThis as typeof globalThis & { __silogiumBeta?: Map<string, BetaParticipant> };
const participants = local.__silogiumBeta ??= new Map<string, BetaParticipant>();
function nextBrasiliaDay(now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(new Date(`${day}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
}

async function call<T>(action: string, actor: Actor, payload: Record<string, unknown> = {}): Promise<T | undefined> {
  const client = createSupabaseAdminClient();
  if (!client) return undefined; // Production configuration rejects missing server credentials before this point.
  const { data, error } = await client.rpc("beta_access", { p_action: action, p_actor_id: actor.id, p_payload: payload });
  if (error) throw new Error("Não foi possível verificar ou atualizar o acesso ao beta. Tente novamente.");
  if (data == null) throw new Error("O controle de acesso ao beta está indisponível.");
  return data as T;
}

/** Server-only access module: database decisions never trust a caller-supplied role or GitHub handle. */
export async function getBetaStatus(actor: Actor): Promise<BetaStatus> {
  const stored = await call<BetaStatus>("status", actor);
  if (stored) return stored;
  return { state: actor.role === "admin" ? "approved" : participants.get(actor.id)?.state ?? "pending",
    isAdmin: actor.role === "admin", dailyLimit: actor.role === "admin" ? null : 2,
    createdToday: 0, reservedToday: 0, remaining: actor.role === "admin" ? null : 2, resetsAt: nextBrasiliaDay(new Date()) };
}

export async function requireBetaAccess(actor: Actor): Promise<BetaStatus> {
  const status = await getBetaStatus(actor);
  if (status.state !== "approved") throw new BetaAccessError(status);
  return status;
}

export async function listBetaParticipants(actor: Actor): Promise<{ participants: BetaParticipant[]; invitations: BetaInvitation[] }> {
  const stored = await call<{ participants: BetaParticipant[]; invitations: BetaInvitation[] }>("list", actor);
  if (stored) return stored;
  if (actor.role !== "admin") throw new Error("Apenas administradores gerenciam o beta.");
  return { participants: [...participants.values()], invitations: [] };
}

export async function updateBetaParticipant(actor: Actor, input: BetaMutation): Promise<void> {
  // Check trusted database role before making a GitHub request, then recheck it inside the mutation RPC.
  if (!(await getBetaStatus(actor)).isAdmin) throw new Error("Apenas administradores gerenciam o beta.");
  if (input.action === "revoke_invite") {
    if (!/^[1-9][0-9]{0,19}$/.test(input.githubId)) throw new Error("Identidade GitHub inválida.");
    await call("revoke_invite", actor, { githubId: input.githubId });
    return;
  }
  if (input.action === "invite") {
    const handle = input.githubHandle.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle)) throw new Error("Informe um usuário GitHub válido.");
    if (!createSupabaseAdminClient()) throw new Error("Convites GitHub precisam do Supabase configurado; a demonstração local não envia convites.");
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store"
    });
    if (!response.ok) throw new Error(response.status === 404 ? "Usuário GitHub não encontrado." : "Não foi possível confirmar o usuário no GitHub. Tente novamente.");
    const profile = await response.json() as { id?: unknown; login?: unknown; type?: unknown };
    if (!Number.isSafeInteger(profile.id) || (profile.id as number) <= 0 || typeof profile.login !== "string" || profile.type !== "User") {
      throw new Error("O convite precisa identificar uma conta pessoal válida do GitHub.");
    }
    await call("invite", actor, { githubId: String(profile.id), githubHandle: profile.login });
    return;
  }
  if (!["approve", "reject", "revoke"].includes(input.action) || !input.userId) throw new Error("Alteração de beta inválida.");
  const result = await call<boolean>(input.action, actor, { userId: input.userId });
  if (result !== undefined) {
    if (result && input.action === "approve") await wakeAuthoringWorker().catch(() => undefined);
    return;
  }
  const existing = participants.get(input.userId);
  participants.set(input.userId, { userId: input.userId, handle: existing?.handle ?? input.userId,
    githubId: existing?.githubId ?? null, githubHandle: existing?.githubHandle ?? null,
    role: "user", state: input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "revoked",
    requestedAt: existing?.requestedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
}

export async function cancelBetaJob(actor: Actor, jobId: string): Promise<boolean> {
  return await call<boolean>("cancel_job", actor, { jobId }) ?? false;
}
export async function resumeBetaJob(actor: Actor, jobId: string): Promise<boolean> {
  await requireBetaAccess(actor);
  const resumed = await call<boolean>("resume_job", actor, { jobId }) ?? false;
  if (resumed) await wakeAuthoringWorker().catch(() => undefined);
  return resumed;
}
