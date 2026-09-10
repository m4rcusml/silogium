import "server-only";
import { emptyPersonalState, updatePersonalState, type Actor, type PersonalAction, type PersonalState } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getAuthoringRepository } from "./authoring";

const store = globalThis as typeof globalThis & { __silogiumPersonal?: Map<string, { handle: string; state: PersonalState }> };
const memory = store.__silogiumPersonal ??= new Map();

export async function readPersonal(actor: Actor): Promise<PersonalState> {
  const admin = createSupabaseAdminClient();
  if (!admin) return structuredClone(memory.get(actor.id)?.state ?? emptyPersonalState(actor.handle));
  const { data, error } = await admin.from("personal_workspaces").select("revision,state").eq("user_id", actor.id).maybeSingle();
  if (error) throw new Error("Não foi possível ler sua biblioteca. Verifique a migração de personalização.");
  return data ? { ...(data.state as PersonalState), revision: data.revision } : emptyPersonalState(actor.handle);
}

export async function personalProblems(actor: Actor, ids: string[]) {
  const repository = getAuthoringRepository();
  const resolved = await Promise.all([...new Set(ids)].map(async (id) => {
    const value = await repository.getPackageById(id, actor);
    return value?.problem;
  }));
  return new Map(resolved.filter((problem) => problem !== undefined).map((problem) => [problem.id, problem]));
}

export async function changePersonal(actor: Actor, expectedRevision: number, action: PersonalAction): Promise<PersonalState> {
  const current = await readPersonal(actor);
  if (current.revision !== expectedRevision) throw new Error("CONFLICT: seus dados mudaram em outra aba. Recarregue antes de salvar.");
  const ids = action.kind === "favorite" ? [action.problemId] : action.kind === "save_list" || action.kind === "start_simulation" ? action.problemIds : [];
  const accessible = await personalProblems(actor, ids);
  const next = updatePersonalState(current, action, { now: new Date(), newId: crypto.randomUUID(), accessible });
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc("save_personal_workspace_for", { requested_user: actor.id, expected_revision: expectedRevision, next_state: next });
    if (error || data !== true) throw new Error("CONFLICT: não foi possível salvar. Recarregue para verificar atualizações em outra aba.");
  } else {
    // No await between CAS and assignment; concurrent actions cannot overwrite each other.
    if ((memory.get(actor.id)?.state.revision ?? 0) !== expectedRevision) throw new Error("CONFLICT: seus dados mudaram em outra aba. Recarregue antes de salvar.");
    memory.set(actor.id, { handle: actor.handle, state: structuredClone(next) });
  }
  return next;
}

export async function publicPersonalProfile(handle: string) {
  const admin = createSupabaseAdminClient();
  let profile;
  if (!admin) profile = [...memory.values()].find((record) => record.handle === handle)?.state.profile;
  else {
    const { data: identity, error } = await admin.from("profiles").select("id,handle").eq("handle", handle).maybeSingle();
    if (error || !identity) return null;
    const { data } = await admin.from("personal_workspaces").select("state").eq("user_id", identity.id).maybeSingle();
    profile = (data?.state as PersonalState | undefined)?.profile;
  }
  // Explicit allowlist: neither activity nor private library can enter a shared profile.
  return profile?.shared ? { handle, displayName: profile.displayName, bio: profile.bio, website: profile.website } : null;
}
