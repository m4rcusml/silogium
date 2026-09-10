import type { Actor } from "@silogium/core";
import { connection } from "next/server";
import { assertProductionServerConfig, isHostedProduction, ProductionConfigurationError } from "./production-config";
import { createSupabaseServerClient } from "./supabase/server";
import { authenticateToken } from "./tokens";

export async function getActor(request?: Request): Promise<Actor> {
  const actor = await getOptionalActor(request);
  if (!actor) throw new Error("Faça login para continuar.");
  return actor;
}

export async function getOptionalActor(request?: Request): Promise<Actor | undefined> {
  // Pages/layouts evaluate credentials only after a real request. Next can build
  // without secrets, but no production request can fall through to local-demo.
  if (!request) await connection();
  assertProductionServerConfig();
  const authorization = request?.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer (sil_[A-Za-z0-9_-]+)$/i.exec(authorization);
    if (!match) throw new Error("Token da CLI inválido ou expirado.");
    const actor = await authenticateToken(match[1]!);
    if (!actor) throw new Error("Token da CLI inválido ou expirado.");
    return actor;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    if (isHostedProduction()) throw new ProductionConfigurationError();
    return { id: "local-demo", handle: "demo", role: "admin" };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return undefined;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("handle,role").eq("id", data.user.id).maybeSingle();
  if (profileError) throw new Error("Não foi possível verificar seu perfil. Tente novamente.");
  return {
    id: data.user.id,
    handle: profile?.handle ?? data.user.user_metadata.user_name ?? data.user.email?.split("@")[0] ?? "usuario",
    role: profile?.role === "admin" ? "admin" : "user"
  };
}
