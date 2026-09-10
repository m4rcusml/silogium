import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafePublicBuildConfig } from "../../../apps/web/lib/build-config.js";

const publicConfig = {
  NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only"
};
const legacyKey = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
const unsafeKeys = ["sb_secret_test_only", "  sb_secret_test_only  ", legacyKey("service_role")];

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("segurança da configuração pública antes do bundle", () => {
  it.each([{}, { NODE_ENV: "production" }, { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }, publicConfig])("permite build sem secrets ou com configuração pública válida: %o", (environment) => {
    expect(() => assertSafePublicBuildConfig(environment)).not.toThrow();
  });

  it.each(unsafeKeys)("recusa credencial privilegiada mesmo sem URL: %s", (key) => {
    expect(() => assertSafePublicBuildConfig({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(/build foi interrompido/);
  });

  it("recusa chave pública idêntica à credencial de serviço opaca", () => {
    expect(() => assertSafePublicBuildConfig({ ...publicConfig, SUPABASE_SERVICE_ROLE_KEY: publicConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY })).toThrow();
  });

  it.each(["not-a-url", "https://user:password@example.supabase.co", "https://example.supabase.co?key=secret", "https://example.supabase.co#secret", "http://example.supabase.co"])("recusa URL pública inválida em produção: %s", (url) => {
    expect(() => assertSafePublicBuildConfig({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: url })).toThrow();
  });

  it("permite anon JWT e Supabase local no desenvolvimento, sem exigir chave de serviço", () => {
    expect(() => assertSafePublicBuildConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon") })).not.toThrow();
  });

  it("não coloca credenciais nem URL na mensagem de erro", () => {
    let thrown: unknown;
    try { assertSafePublicBuildConfig({ ...publicConfig, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test_only" }); } catch (error) { thrown = error; }
    expect(String(thrown)).not.toMatch(/test_only|supabase\.co|sb_secret/);
  });

  it.each(["sb_secret_test_only", legacyKey("service_role"), "same_opaque_test_only"])("next.config interrompe a avaliação antes de exportar configuração insegura: %s", async (key) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "same_opaque_test_only");
    // Import the actual config, not its source text. No Next build or .env loader.
    const configPath = "../../../apps/web/next.config.ts";
    await expect(import(configPath)).rejects.toThrow(/build foi interrompido/);
  });

  it("next.config continua exportando a configuração de build sem secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const configPath = "../../../apps/web/next.config.ts";
    const loaded = await import(configPath);
    expect(loaded.default).toMatchObject({ devIndicators: false });
  });
});
