import { checkQuota, type QuotaKind, type UsageEvent } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";

const globalUsage = globalThis as typeof globalThis & { __silogiumUsage?: Map<string, UsageEvent[]> };
const usage: Map<string, UsageEvent[]> = globalUsage.__silogiumUsage ??= new Map<string, UsageEvent[]>();

export async function consumeQuota(actorId: string, kind: QuotaKind) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc("consume_quota_for", { requested_user: actorId, requested_kind: kind });
    if (error) throw new Error(`Não foi possível verificar a cota: ${error.message}`);
    return data as { allowed: boolean; remaining?: number; reason?: "daily" | "minute" };
  }
  const events = usage.get(actorId) ?? [];
  const status = checkQuota(kind, events);
  if (!status.allowed) return status;
  events.push({ kind, occurredAt: new Date() });
  usage.set(actorId, events);
  return checkQuota(kind, events);
}

export async function refundQuota(actorId: string, kind: QuotaKind) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.rpc("refund_quota_for", { requested_user: actorId, requested_kind: kind });
    if (error) throw new Error(`Não foi possível devolver a cota: ${error.message}`);
    return;
  }
  const events = usage.get(actorId) ?? [];
  let index = -1;
  for (let current = events.length - 1; current >= 0; current -= 1) {
    if (events[current]?.kind === kind) { index = current; break; }
  }
  if (index >= 0) events.splice(index, 1);
  usage.set(actorId, events);
}
