import { AsyncLocalStorage } from "node:async_hooks";
import { CapacityUnavailableError, OperationalAvailabilitySchema, ModalReservationDecisionSchema, type Actor, type CapacityService, type OperationalAvailability, type ServiceAvailability } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { isHostedProduction } from "./production-config";
import { requireBetaAccess } from "./beta";

const actors = new AsyncLocalStorage<{ actor: Actor; fence?: () => Promise<void> }>();
export function withExecutionActor<T>(actor: Actor, compute: () => Promise<T>, fence?: () => Promise<void>) {
  return actors.run({ actor, fence }, compute);
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("A capacidade compartilhada exige persistência.");
  const { data, error } = await client.rpc("operational_capacity", { p_action: action, p_payload: payload });
  if (error) throw new Error("Não foi possível verificar a capacidade gratuita.");
  return data;
}

export async function getOperationalAvailability(): Promise<OperationalAvailability> {
  if (!isHostedProduction() && !createSupabaseAdminClient()) return {
    groq: { available: true },
    modal: process.env.MODAL_JUDGE_ENDPOINT?.trim()
      ? { available: false, reason: "A execução remota exige Supabase para verificar e reservar capacidade gratuita, inclusive em desenvolvimento." }
      : { available: true }
  };
  try { return OperationalAvailabilitySchema.parse(await call("status")); }
  catch {
    const unavailable = { available: false, reason: "Não foi possível confirmar a capacidade gratuita. O catálogo público continua disponível." };
    return { groq: unavailable, modal: unavailable };
  }
}

export async function requireOperationalCapacity(service: CapacityService) {
  const current = actors.getStore();
  if (current) {
    await current.fence?.();
    await requireBetaAccess(current.actor);
  }
  const availability = (await getOperationalAvailability())[service];
  if (!availability.available) throw new CapacityUnavailableError(service, availability);
}

export async function setOperationalPaused(actor: Actor, service: CapacityService, paused: boolean): Promise<OperationalAvailability> {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem suspender o processamento.");
  return OperationalAvailabilitySchema.parse(await call("set_paused", { actorId: actor.id, service, paused }));
}

export async function reserveModalCapacity(id: string, estimateMicrousd: number): Promise<void> {
  await requireOperationalCapacity("modal");
  if (!isHostedProduction() && !createSupabaseAdminClient()) return;
  let availability: ServiceAvailability;
  try {
    const result = ModalReservationDecisionSchema.parse(await call("reserve_modal", { id, estimateMicrousd }));
    if (result.allowed) return;
    availability = result.availability ?? { available: false };
  } catch { availability = { available: false, reason: "Não foi possível reservar capacidade gratuita de execução." }; }
  throw new CapacityUnavailableError("modal", availability);
}

export async function finishModalReservation(id: string) {
  if (!isHostedProduction() && !createSupabaseAdminClient()) return;
  // Unknown final cost retains its ceiling. Never invent a refund from candidate duration.
  await call("finish_modal", { id });
}
