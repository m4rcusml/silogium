/** Shared with the browser. This module never reads server environment variables. */
export function validatePublicSupabaseUrl(url: string, requireHttps: boolean): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash
      || !(requireHttps ? parsed.protocol === "https:" : ["http:", "https:"].includes(parsed.protocol))) return false;
    return true;
  } catch { return false; }
}

export function validatePublicSupabaseKey(value: string): boolean {
  const key = value.trim();
  if (!key || key.startsWith("sb_secret_")) return false;
  // Reject a misplaced legacy service-role JWT too; decoding is only a safety
  // check, never authentication or signature verification.
  const payload = key.split(".")[1];
  if (payload) {
    try {
      const decoded: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      if (decoded && typeof decoded === "object" && "role" in decoded && decoded.role === "service_role") return false;
    } catch { /* Supabase validates credentials; an opaque publishable key is allowed. */ }
  }
  return true;
}

export function validatePublicSupabaseConfig(url: string, key: string, requireHttps: boolean): boolean {
  return validatePublicSupabaseUrl(url, requireHttps) && validatePublicSupabaseKey(key);
}
