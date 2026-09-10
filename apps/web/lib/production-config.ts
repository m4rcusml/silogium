import { validatePublicSupabaseConfig } from "./supabase/public-config";

/** Deployment previews also have external visitors; they must never enable demo auth. */
export function isHostedProduction(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production" || environment.VERCEL_ENV === "preview";
}

export class ProductionConfigurationError extends Error {
  readonly code = "production_configuration_unavailable";
  readonly status = 503;
  constructor() {
    // This error may reach a JSON response. Never include env values or SDK errors.
    super("Configuração de produção indisponível. Verifique a configuração do Supabase no servidor.");
    this.name = "ProductionConfigurationError";
  }
}

/** Runtime-only guard. No validation at import time, no build-phase bypass.
 * The web can operate without AI configuration; provider/worker policy is separate.
 * Call before auth (including CLI tokens), database access, and cached adapters.
 */
export function assertProductionServerConfig(environment: NodeJS.ProcessEnv = process.env): void {
  if (!isHostedProduction(environment)) return;
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !publicKey || !serviceKey || publicKey === serviceKey || !validatePublicSupabaseConfig(url, publicKey, true)) {
    throw new ProductionConfigurationError();
  }
}
