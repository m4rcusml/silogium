import { deploymentReadiness } from "../apps/web/lib/deployment-readiness.js";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env-file");
if (envIndex >= 0) {
  const path = args[envIndex + 1];
  if (!path || path.startsWith("--")) throw new Error("Informe um arquivo após --env-file.");
  try { process.loadEnvFile(path); } catch { throw new Error("Não foi possível carregar o arquivo de configuração. Nenhum valor foi exibido."); }
  args.splice(envIndex, 2);
}
if (args.some((arg) => arg !== "--worker")) throw new Error("Uso: npm run deploy:check -- [--worker] [--env-file caminho]");
const checks = deploymentReadiness(process.env, args.includes("--worker") ? "worker" : "web");
for (const item of checks) console.log(`[${item.status.toUpperCase()}] ${item.id}: ${item.message}`);
console.log("Diagnóstico local, sem chamadas externas. OK de configuração não comprova prontidão de produção.");
if (checks.some((item) => item.status === "error")) process.exitCode = 1;
