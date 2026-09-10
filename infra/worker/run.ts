/** Standalone, trusted authoring worker. Never run inside a candidate sandbox. */
import { setTimeout as delay } from "node:timers/promises";
import { getAuthoringWorker } from "../../apps/web/lib/authoring.js";
import { drainAuthoringWorker } from "./loop.js";

async function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) if (!["--once", "--drain", "--poll", "--check", "--development"].includes(arg)) throw new Error("Use --once, --drain ou --check; --development --poll é somente para testes locais com Supabase.");
  if (["--once", "--drain", "--poll", "--check"].filter((arg) => args.has(arg)).length > 1) throw new Error("Escolha somente um modo do worker.");
  // Standalone Node does not set NODE_ENV. Hosted execution must fail closed by default.
  if (args.has("--development")) {
    if (process.env.MODAL_IS_REMOTE || process.env.VERCEL_ENV) throw new Error("Modo development não permitido em hospedagem.");
    process.env.NODE_ENV = "development";
  } else process.env.NODE_ENV = "production";
  if (args.has("--poll") && !args.has("--development")) throw new Error("O poller contínuo é somente local. Use --drain em hospedagem.");
  const worker = getAuthoringWorker();
  if (args.has("--check")) {
    console.log("Configuração do worker válida. Este check não testa conexão, migrações, provedor ou judge.");
    return;
  }
  let stopping = false;
  process.once("SIGTERM", () => { stopping = true; });
  process.once("SIGINT", () => { stopping = true; });
  const onResult = (status: string) => console.log(JSON.stringify({ event: "authoring_worker", status, at: new Date().toISOString() }));
  if (args.has("--drain")) {
    const result = await drainAuthoringWorker(worker, { stopping: () => stopping, onResult });
    console.log(JSON.stringify({ event: "authoring_worker_exit", ...result, at: new Date().toISOString() }));
    return;
  }
  do {
    const status = await worker.runOnce();
    onResult(status);
    if (!args.has("--poll") || stopping) break;
    if (status === "idle") await delay(3_000);
  } while (!stopping);
}

main().catch(() => {
  // Exceptions from providers may contain request/response data. Keep worker logs content-free.
  console.error("Worker de autoria indisponível. Confira configuração, migrações e logs operacionais dos serviços; nenhum segredo é registrado aqui.");
  process.exitCode = 1;
});
