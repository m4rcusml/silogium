import { describe, expect, it } from "vitest";
import { deploymentReadiness } from "../../../apps/web/lib/deployment-readiness.js";
import { studioAvailability } from "../../../apps/web/lib/studio-availability.js";

const configured: NodeJS.ProcessEnv = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SERVICE_ROLE_KEY: "private-server-secret", MODAL_JUDGE_ENDPOINT: "https://judge.example.test",
  MODAL_JUDGE_TOKEN: "private-token-that-is-at-least-32-characters", SILOGIUM_ALLOW_LOCAL_EXECUTION: "false" };

describe("diagnóstico de preparação offline", () => {
  it("recusa configuração ausente sem inventar uma exigência de IA para o site", () => {
    expect(deploymentReadiness({}).filter((item) => item.status === "error").map((item) => item.id))
      .toEqual(["supabase", "app-url", "judge-endpoint", "judge-token", "local-execution"]);
    const result = deploymentReadiness(configured);
    expect(result.filter((item) => item.status === "error")).toEqual([]);
    expect(result.some((item) => item.id === "ai-disabled" && item.status === "ok")).toBe(true);
    expect(result.some((item) => item.status === "manual")).toBe(true);
  });
  it("worker exige ativação explícita e configuração própria", () => {
    expect(deploymentReadiness(configured, "worker").filter((item) => item.status === "error").map((item) => item.id))
      .toEqual(["worker-enabled", "ai-provider"]);
    const result = deploymentReadiness({ ...configured, SILOGIUM_AUTHORING_ENABLED: "true", SILOGIUM_AI_PROVIDER: "groq", GROQ_API_KEY: "secret-api-example" }, "worker");
    expect(result.some((item) => item.status === "error")).toBe(false);
    expect(result.find((item) => item.id === "worker-live")?.status).toBe("manual");
  });
  it("não vaza valores de configuração, incluindo credenciais numa URL inválida", () => {
    const result = deploymentReadiness({ ...configured, MODAL_JUDGE_ENDPOINT: "https://user:password-never-print@host.test",
      NEXT_PUBLIC_OPENAI_API_KEY: "secret-never-print", SILOGIUM_AUTHORING_ENABLED: "yes", SILOGIUM_VERIFIED_JUDGE_POLICY: "policy-never-print" });
    expect(result.filter((item) => item.status === "error").map((item) => item.id)).toEqual(["judge-endpoint", "authoring-flag", "public-secrets"]);
    const text = JSON.stringify(result);
    for (const secret of ["password-never-print", "secret-never-print", "policy-never-print", configured.SUPABASE_SERVICE_ROLE_KEY!, configured.MODAL_JUDGE_TOKEN!]) expect(text).not.toContain(secret);
  });
  it("não tenta resolver provedor local nem exige chave na página hospedada", () => {
    expect(studioAvailability({ NODE_ENV: "production", SILOGIUM_AI_PROVIDER: "not-installed" }))
      .toEqual({ available: false, providerLabel: "IA ainda não habilitada neste ambiente" });
    expect(studioAvailability({ VERCEL_ENV: "preview", SILOGIUM_AUTHORING_ENABLED: "true" }))
      .toEqual({ available: true, providerLabel: "Processamento em segundo plano" });
    expect(studioAvailability({ NODE_ENV: "development", SILOGIUM_AI_PROVIDER: "local" }))
      .toEqual({ available: true, providerLabel: "Simulador local" });
  });
});
