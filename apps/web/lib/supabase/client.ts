import { createBrowserClient } from "@supabase/ssr";
import { validatePublicSupabaseConfig } from "./public-config";

export function createSupabaseBrowserClient() {
  // Direct NEXT_PUBLIC references are required for Next's build-time inlining.
  // Missing configuration disables login; never invent a client/session here.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !validatePublicSupabaseConfig(url, key, process.env.NODE_ENV === "production")) return null;
  return createBrowserClient(url, key);
}
