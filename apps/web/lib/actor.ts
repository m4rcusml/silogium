import type { Actor } from "@silogium/core";
import { createSupabaseServerClient } from "./supabase/server";
import { authenticateToken } from "./tokens";

export async function getActor(request?: Request): Promise<Actor> {
  const actor = await getOptionalActor(request);
  if (!actor) throw new Error("Faça login para continuar.");
  return actor;
}

export async function getOptionalActor(request?: Request): Promise<Actor | undefined> {
  const authorization = request?.headers.get("authorization");
  if (authorization?.startsWith("Bearer sil_")) {
    const actor = await authenticateToken(authorization.slice("Bearer ".length));
    if (!actor) throw new Error("Token da CLI inválido ou expirado.");
    return actor;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { id: "local-demo", handle: "demo", role: "admin" };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return undefined;
  const { data: profile } = await supabase.from("profiles").select("handle,role").eq("id", data.user.id).maybeSingle();
  return {
    id: data.user.id,
    handle: profile?.handle ?? data.user.user_metadata.user_name ?? data.user.email?.split("@")[0] ?? "usuario",
    role: profile?.role === "admin" ? "admin" : "user"
  };
}
