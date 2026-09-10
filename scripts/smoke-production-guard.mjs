// Starts only its own short-lived server on a free loopback port. No credentials,
// public exposure, data writes, AI calls, or interference with port 3000/3100.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const allocation = createServer();
allocation.listen(0, "127.0.0.1");
await once(allocation, "listening");
const port = allocation.address().port;
await new Promise((done) => allocation.close(done));
const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: resolve(root, "apps/web"), windowsHide: true, stdio: ["ignore", "ignore", "ignore"],
  env: { ...process.env, NODE_ENV: "production", NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-build",
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "", MODAL_JUDGE_ENDPOINT: "", MODAL_JUDGE_TOKEN: "", OPENAI_API_KEY: "",
    SILOGIUM_AI_PROVIDER: "local", SILOGIUM_AUTHORING_ENABLED: "false", SILOGIUM_ALLOW_LOCAL_EXECUTION: "false",
    SILOGIUM_VERIFIED_JUDGE_POLICY: "", NEXT_TELEMETRY_DISABLED: "1" }
});
let processError = false;
child.once("error", () => { processError = true; });
const finished = once(child, "exit").catch(() => undefined);
const url = `http://127.0.0.1:${port}`;
try {
  let ready;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (processError || child.exitCode !== null) throw new Error("Servidor de smoke não iniciou. Execute o build separado antes deste teste.");
    try { ready = await fetch(`${url}/api/v1/jobs/not-a-job`, { signal: AbortSignal.timeout(1500) }); break; }
    catch { await delay(250); }
  }
  assert.ok(ready, "Servidor de smoke não ficou disponível.");
  const requests = [
    ["jobs anonymous", ready],
    ["jobs bearer", await fetch(`${url}/api/v1/jobs/not-a-job`, { headers: { authorization: "Bearer sil_synthetic_smoke_token" }, signal: AbortSignal.timeout(10000) })],
    ["authoring", await fetch(`${url}/api/v1/authoring`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "create", prompt: "Uma questão de teste sintético" }), signal: AbortSignal.timeout(10000) })]
  ];
  for (const [name, response] of requests) {
    assert.ok(response.status >= 400, `${name}: produção não pode aceitar o pedido sem banco.`);
    const body = await response.json();
    assert.match(body.error ?? "", /Configuração de produção indisponível/);
    assert.equal(body.jobId, undefined);
    assert.ok(!JSON.stringify(body).includes("local-demo"));
    console.log(`${name}: acesso bloqueado sem fallback demo (HTTP ${response.status}).`);
  }
} finally {
  // Kill only the exact child this script created, never other Node processes.
  if (child.exitCode === null && child.pid) child.kill();
  await Promise.race([finished, delay(5000)]);
}
