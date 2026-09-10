import { isHostedProduction } from "./production-config";
import { validatePublicSupabaseKey, validatePublicSupabaseUrl } from "./supabase/public-config";

/** Build-time safety is separate from runtime completeness. NEXT_PUBLIC values
 * are frozen into browser JavaScript, so unsafe values must fail before bundling.
 * Missing configuration remains allowed for offline CI builds.
 */
export function assertSafePublicBuildConfig(environment: Readonly<Record<string, string | undefined>>): void {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if ((url && !validatePublicSupabaseUrl(url, isHostedProduction(environment)))
    || (publicKey && (!validatePublicSupabaseKey(publicKey) || publicKey === serviceKey))) {
    // Config errors are printed by Next. Never interpolate credentials or URLs.
    throw new Error("Configuração pública do Supabase insegura ou inválida. O build foi interrompido antes de gerar o código do navegador.");
  }
}
