import "server-only";
import type { Actor, Runtime, SolutionSnapshot } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getAuthoringRepository } from "./authoring";

type StoredDraft = { revision: number; snapshot: SolutionSnapshot; updatedAt: string };
type DraftIdentity = { problemId: string; version: number; runtime: Runtime; accessKey?: string };
const scope = globalThis as typeof globalThis & { __silogiumSyncedDrafts?: Map<string, StoredDraft> };
const drafts = scope.__silogiumSyncedDrafts ??= new Map<string, StoredDraft>();
const key = (actor: Actor, identity: DraftIdentity) => JSON.stringify([actor.id, identity.problemId, identity.version, identity.runtime]);
async function authorize(actor: Actor, identity: DraftIdentity) {
  const value = await getAuthoringRepository().getPackageVersion(identity.problemId, identity.version, actor, identity.accessKey);
  if (!value || !value.problem.runtimes.some((runtime) => runtime.language === identity.runtime)) throw new Error("Questão ou linguagem não disponível para sua conta.");
}
export async function readSolutionDraft(actor: Actor, identity: DraftIdentity): Promise<StoredDraft | null> {
  await authorize(actor, identity);
  const admin = createSupabaseAdminClient();
  if (!admin) return structuredClone(drafts.get(key(actor, identity)) ?? null);
  const { data, error } = await admin.from("solution_drafts").select("revision,snapshot,updated_at").eq("user_id", actor.id).eq("problem_id", identity.problemId).eq("problem_version", identity.version).eq("runtime", identity.runtime).maybeSingle();
  if (error) throw new Error("Não foi possível consultar o rascunho sincronizado.");
  return data ? { revision: data.revision, snapshot: data.snapshot as SolutionSnapshot, updatedAt: data.updated_at } : null;
}
export async function saveSolutionDraft(actor: Actor, identity: DraftIdentity, expectedRevision: number, snapshot: SolutionSnapshot) {
  await authorize(actor, identity);
  const next = { revision: expectedRevision + 1, snapshot, updatedAt: new Date().toISOString() };
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc("save_solution_draft_for", { requested_user: actor.id, requested_problem: identity.problemId, requested_version: identity.version, requested_runtime: identity.runtime, expected_revision: expectedRevision, requested_snapshot: snapshot });
    if (error || data !== true) throw new Error("CONFLICT: existe um rascunho mais recente. Consulte a versão salva antes de substituir.");
  } else {
    if ((drafts.get(key(actor, identity))?.revision ?? 0) !== expectedRevision) throw new Error("CONFLICT: existe um rascunho mais recente. Consulte antes de substituir.");
    drafts.set(key(actor, identity), structuredClone(next));
  }
  return next;
}
