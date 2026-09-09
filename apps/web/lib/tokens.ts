import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase/admin";

type TokenRecord = { id: string; hash: string; actorId: string; prefix: string; createdAt: string; expiresAt: string; revokedAt?: string };
const globalTokens = globalThis as typeof globalThis & { __silogiumTokens?: Map<string, TokenRecord> };
const tokens = globalTokens.__silogiumTokens ??= new Map<string, TokenRecord>();

export async function issueToken(actorId: string) {
  const secret = `sil_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(secret).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const record = { id: crypto.randomUUID(), hash, actorId, prefix: secret.slice(0, 10), createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.from("api_tokens").insert({
      id: record.id,
      user_id: actorId,
      token_hash: hash,
      prefix: record.prefix,
      expires_at: record.expiresAt
    });
    if (error) throw new Error(`Não foi possível criar o token: ${error.message}`);
  }
  tokens.set(hash, record);
  return { token: secret, ...record };
}

export async function revokeToken(id: string, actorId: string) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", actorId).is("revoked_at", null).select("id");
    if (error) throw new Error(`Não foi possível revogar o token: ${error.message}`);
    if (data?.length) return true;
  }
  const found = [...tokens.entries()].find(([, record]) => record.id === id);
  if (!found) return false;
  const [hash, record] = found;
  if (!record || record.actorId !== actorId) return false;
  record.revokedAt = new Date().toISOString();
  tokens.set(hash, record);
  return true;
}

export async function listTokens(actorId: string) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.from("api_tokens").select("id,prefix,created_at,expires_at,revoked_at,last_used_at").eq("user_id", actorId).order("created_at", { ascending: false });
    if (error) throw new Error(`Não foi possível listar tokens: ${error.message}`);
    return data ?? [];
  }
  return [...tokens.values()].filter((record) => record.actorId === actorId).map((record) => ({
    id: record.id,
    prefix: record.prefix,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    revoked_at: record.revokedAt ?? null,
    last_used_at: null
  }));
}

export async function authenticateToken(secret: string) {
  const hash = createHash("sha256").update(secret).digest("hex");
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.from("api_tokens").select("user_id,expires_at,revoked_at").eq("token_hash", hash).maybeSingle();
    if (error) throw new Error(`Não foi possível validar o token: ${error.message}`);
    if (!data || data.revoked_at || new Date(data.expires_at) <= new Date()) return null;
    const { data: profile } = await admin.from("profiles").select("handle,role").eq("id", data.user_id).maybeSingle();
    await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);
    return { id: data.user_id, handle: profile?.handle ?? "cli", role: profile?.role === "admin" ? "admin" as const : "user" as const };
  }
  const record = tokens.get(hash);
  if (!record || record.revokedAt || new Date(record.expiresAt) <= new Date()) return null;
  return { id: record.actorId, handle: "cli", role: "user" as const };
}
