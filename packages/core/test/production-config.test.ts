import { describe, expect, it } from "vitest";
import { assertProductionServerConfig, isHostedProduction, ProductionConfigurationError } from "../../../apps/web/lib/production-config.js";

const configured = {
  NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_only"
};

describe("configuração de produção fail-closed", () => {
  it.each([{}, { NODE_ENV: "development" }, { NODE_ENV: "test" }, { NODE_ENV: "development", VERCEL_ENV: "development" }])("preserva demonstração local sem credenciais: %o", (environment) => {
    expect(isHostedProduction(environment)).toBe(false);
    expect(() => assertProductionServerConfig(environment)).not.toThrow();
  });

  it.each([{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }, { NODE_ENV: "test", VERCEL_ENV: "preview" }])("não oferece demo em produção ou preview: %o", (environment) => {
    expect(isHostedProduction(environment)).toBe(true);
    expect(() => assertProductionServerConfig(environment)).toThrow(ProductionConfigurationError);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"])("exige %s antes de autenticar ou acessar banco", (key) => {
    for (const missing of [undefined, "", "  "]) {
      expect(() => assertProductionServerConfig({ ...configured, [key]: missing })).toThrow(ProductionConfigurationError);
    }
  });

  it.each(["not-a-url", "http://example.supabase.co", "https://user:secret@example.supabase.co", "https://example.supabase.co?key=secret", "https://example.supabase.co#secret"])("bloqueia URL inválida ou insegura sem ecoar valores: %s", (url) => {
    expect(() => assertProductionServerConfig({ ...configured, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(ProductionConfigurationError);
  });

  it("não exige OpenAI ou qualquer provedor de IA para operar a plataforma", () => {
    expect(() => assertProductionServerConfig(configured)).not.toThrow();
    expect(() => assertProductionServerConfig({ ...configured, SILOGIUM_AI_PROVIDER: "disabled" })).not.toThrow();
  });

  it("não permite credencial de serviço no campo público", () => {
    const legacyService = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    for (const publicKey of [configured.SUPABASE_SERVICE_ROLE_KEY, "sb_secret_another_test", legacyService]) {
      expect(() => assertProductionServerConfig({ ...configured, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey })).toThrow(ProductionConfigurationError);
    }
  });

  it("não confunde anon JWT legado com service role", () => {
    const legacyAnon = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(() => assertProductionServerConfig({ ...configured, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyAnon })).not.toThrow();
  });

  it("expõe erro estável 503 sem secrets, valores ou configuração interna", () => {
    let thrown: unknown;
    try { assertProductionServerConfig({ ...configured, SUPABASE_SERVICE_ROLE_KEY: undefined }); } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({ code: "production_configuration_unavailable", status: 503 });
    expect(String(thrown)).not.toMatch(/sb_secret|sb_publishable|example\.supabase|NEXT_PUBLIC/);
    expect(JSON.stringify(thrown)).not.toContain("test_only");
  });

  it("não considera NEXT_PHASE um bypass de segurança de produção", () => {
    expect(() => assertProductionServerConfig({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toThrow(ProductionConfigurationError);
  });
});
