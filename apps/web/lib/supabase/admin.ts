import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertProductionServerConfig } from "../production-config";

let cached: { url: string; serviceKey: string; client: SupabaseClient } | undefined;

export function createSupabaseAdminClient(): SupabaseClient | null {
  assertProductionServerConfig();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  if (cached?.url === url && cached.serviceKey === serviceKey) return cached.client;
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  cached = { url, serviceKey, client };
  return client;
}
