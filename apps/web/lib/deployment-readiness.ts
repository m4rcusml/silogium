import { assertProductionServerConfig } from "./production-config.js";

export type DeploymentCheck = { id: string; status: "ok" | "error" | "manual"; message: string };

function publicHttps(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash
      && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

/** Offline readiness, not a health check. Returns no supplied values or secrets. */
export function deploymentReadiness(environment: NodeJS.ProcessEnv, target: "web" | "worker" = "web"): DeploymentCheck[] {
  const checks: DeploymentCheck[] = [];
  const check = (id: string, valid: boolean, message: string) => checks.push({ id, status: valid ? "ok" : "error", message });
  try {
    assertProductionServerConfig({ ...environment, NODE_ENV: "production" });
    check("supabase", true, "Configuração Supabase presente e separação das chaves verificada.");
  } catch { check("supabase", false, "Configure URL HTTPS, chave pública e chave de servidor distintas para o Supabase."); }
  if (target === "web") check("app-url", publicHttps(environment.NEXT_PUBLIC_APP_URL), "NEXT_PUBLIC_APP_URL deve ser a URL HTTPS pública do ambiente.");
  check("judge-endpoint", publicHttps(environment.MODAL_JUDGE_ENDPOINT), "MODAL_JUDGE_ENDPOINT deve ser uma URL HTTPS sem credenciais embutidas.");
  check("judge-token", (environment.MODAL_JUDGE_TOKEN?.trim().length ?? 0) >= 32, "MODAL_JUDGE_TOKEN deve ter pelo menos 32 caracteres e coincidir com o secret do controlador.");
  check("local-execution", environment.SILOGIUM_ALLOW_LOCAL_EXECUTION === "false", "SILOGIUM_ALLOW_LOCAL_EXECUTION deve estar explicitamente false em ambientes hospedados.");
  check("authoring-flag", [undefined, "", "true", "false"].includes(environment.SILOGIUM_AUTHORING_ENABLED), "SILOGIUM_AUTHORING_ENABLED aceita somente true ou false; ausente significa desabilitada em produção.");
  if (target === "worker") {
    check("worker-enabled", environment.SILOGIUM_AUTHORING_ENABLED === "true", "O worker requer SILOGIUM_AUTHORING_ENABLED=true após a escolha e configuração do provedor.");
    check("ai-provider", environment.SILOGIUM_AI_PROVIDER === "groq" && Boolean(environment.GROQ_API_KEY?.trim())
      && (!environment.GROQ_AUTHORING_MODEL || environment.GROQ_AUTHORING_MODEL === "openai/gpt-oss-120b"),
      "Configure groq, GROQ_API_KEY e openai/gpt-oss-120b no worker. Não há fallback para outro provedor.");
  }
  if (environment.SILOGIUM_AUTHORING_ENABLED === "true") checks.push({ id: "worker-live", status: "manual", message: "Comprovar wake autenticado, worker sob demanda, leitura de faturamento no contexto Modal, recuperação e migrações 014/015. A flag não comprova isso." });
  else checks.push({ id: "ai-disabled", status: "ok", message: "Studio sem novas operações de IA; catálogo, resolução e histórico não dependem de uma chave de IA." });
  const publicSecretNames = Object.keys(environment).filter((key) => key.startsWith("NEXT_PUBLIC_") && /(?:SECRET|SERVICE_ROLE|API_KEY|AUTH_TOKEN|PASSWORD)/.test(key) && environment[key]);
  check("public-secrets", publicSecretNames.length === 0, "Não colocar chaves de servidor, senhas ou tokens em variáveis NEXT_PUBLIC_.");
  checks.push({ id: "integration", status: "manual", message: "Validar migrações/pgTAP, OAuth com duas contas, RLS, seeds privados, limites reais do Modal e restauração de backup em staging." });
  checks.push({ id: "beta-capacity", status: "manual", message: "Confirmar limites financeiros nativos do Modal, ciclo e créditos gratuitos; atestação e consumo recente no ledger. Para o smoke autorizado, teto interno de US$ 1. Código/configuração não comprova ausência de cobrança." });
  checks.push({ id: "judge-policy", status: "manual", message: environment.SILOGIUM_VERIFIED_JUDGE_POLICY
    ? "Política oficial configurada: exigir evidências da auditoria do runner e dos bundles antes de publicar."
    : "Política oficial desabilitada: manter assim até a auditoria; accepted sozinho não concede progresso oficial." });
  return checks;
}
