import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertProductionServerConfig } from "../production-config";

export async function createSupabaseServerClient() {
  assertProductionServerConfig();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components não escrevem cookies. */ }
      }
    }
  });
}
