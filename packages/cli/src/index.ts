#!/usr/bin/env node
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { JudgeBundleSchema, ProblemDefinitionSchema, type ExecutionResult, type Runtime } from "@silogium/core";
import { LocalJudgeAdapter } from "@silogium/judge";

type Config = { token?: string; apiUrl: string };
const runtimeAliases: Record<string, Runtime> = { ts: "typescript", typescript: "typescript", py: "python", python: "python" };

function configPath() {
  const base = process.platform === "win32" ? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming")) : (process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"));
  return join(base, "Silogium", "credentials.json");
}

async function readConfig(): Promise<Config> {
  try { return { apiUrl: "http://localhost:3000/api/v1", ...JSON.parse(await readFile(configPath(), "utf8")) }; }
  catch { return { apiUrl: process.env.SILOGIUM_API_URL ?? "http://localhost:3000/api/v1" }; }
}

async function saveConfig(config: Config) {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
}

async function api(path: string, options: RequestInit = {}) {
  const config = await readConfig();
  const response = await fetch(`${process.env.SILOGIUM_API_URL ?? config.apiUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(config.token ? { authorization: `Bearer ${config.token}` } : {}), ...options.headers }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error ?? `Silogium respondeu HTTP ${response.status}.`);
  return body;
}

function workspaceRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".silogium", "problem.json"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("Não encontrei .silogium/problem.json. Execute silogium pull primeiro.");
    current = parent;
  }
}

async function authenticate(token?: string) {
  if (!token?.startsWith("sil_")) throw new Error("Informe um token válido gerado no seu perfil: silogium auth sil_...");
  const config = await readConfig();
  await saveConfig({ ...config, token });
  console.log(`Autenticação salva em ${configPath()}.`);
}

async function pull(slug?: string, runtimeInput?: string, targetInput?: string, force = false, accessKey?: string) {
  if (!slug) throw new Error("Uso: silogium pull <slug> [--runtime ts|py] [--dir pasta]");
  const payload = await api(`/problems/${encodeURIComponent(slug)}${accessKey ? `?access_key=${encodeURIComponent(accessKey)}` : ""}`);
  const problem = ProblemDefinitionSchema.parse(payload.problem);
  const runtime = runtimeAliases[runtimeInput ?? "ts"];
  if (!runtime) throw new Error("Runtime inválido. Use ts ou py.");
  const definition = problem.runtimes.find((item) => item.language === runtime);
  if (!definition) throw new Error(`A questão não suporta ${runtime}.`);
  const target = resolve(targetInput ?? slug);
  if (existsSync(target) && !force) throw new Error(`A pasta ${target} já existe. Use --force para atualizar somente os arquivos do Silogium.`);
  await mkdir(join(target, ".silogium"), { recursive: true });
  const extension = runtime === "typescript" ? "ts" : "py";
  const solutionPath = join(target, `solution.${extension}`);
  if (!existsSync(solutionPath)) await writeFile(solutionPath, definition.starterCode, "utf8");
  await writeFile(join(target, "README.md"), problem.stages.map((stage) => stage.statementMd).join("\n\n---\n\n"), "utf8");
  await writeFile(join(target, ".silogium", "problem.json"), JSON.stringify(problem, null, 2), "utf8");
  await writeFile(join(target, ".silogium", "visible.json"), JSON.stringify({ schemaVersion: 1, problemId: problem.id, problemVersion: problem.version, visibleCases: payload.visibleCases, hiddenCases: [], referenceSolutions: {} }, null, 2), "utf8");
  await writeFile(join(target, ".silogium", "workspace.json"), JSON.stringify({ runtime, solution: basename(solutionPath) }, null, 2), "utf8");
  if (accessKey) {
    const accessPath = join(target, ".silogium", "access-key");
    await writeFile(accessPath, accessKey, { encoding: "utf8", mode: 0o600 });
    if (process.platform !== "win32") await chmod(accessPath, 0o600);
    const ignorePath = join(target, ".gitignore");
    if (!existsSync(ignorePath)) await writeFile(ignorePath, ".silogium/access-key\n", "utf8");
  }
  console.log(`Questão baixada em ${target}`);
  console.log(`Edite ${solutionPath} e execute: silogium test`);
}

async function testLocally(stageInput?: string) {
  const root = workspaceRoot();
  const problem = ProblemDefinitionSchema.parse(JSON.parse(await readFile(join(root, ".silogium", "problem.json"), "utf8")));
  const bundle = JudgeBundleSchema.parse(JSON.parse(await readFile(join(root, ".silogium", "visible.json"), "utf8")));
  const workspace = JSON.parse(await readFile(join(root, ".silogium", "workspace.json"), "utf8")) as { runtime: Runtime; solution: string };
  const source = await readFile(join(root, workspace.solution), "utf8");
  const maxStage = stageInput ? Number(stageInput) : undefined;
  const result = await new LocalJudgeAdapter().evaluate(problem, bundle, { kind: "run", problemId: problem.id, problemVersion: problem.version, runtime: workspace.runtime, source, maxStage });
  printResult(result);
  process.exitCode = result.verdict === "accepted" ? 0 : 1;
}

async function submit() {
  const root = workspaceRoot();
  const problem = ProblemDefinitionSchema.parse(JSON.parse(await readFile(join(root, ".silogium", "problem.json"), "utf8")));
  const workspace = JSON.parse(await readFile(join(root, ".silogium", "workspace.json"), "utf8")) as { runtime: Runtime; solution: string };
  const source = await readFile(join(root, workspace.solution), "utf8");
  const accessPath = join(root, ".silogium", "access-key");
  const accessKey = existsSync(accessPath) ? (await readFile(accessPath, "utf8")).trim() : undefined;
  const result = await api("/executions", { method: "POST", body: JSON.stringify({ kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime: workspace.runtime, source, accessKey }) }) as ExecutionResult;
  printResult(result);
  process.exitCode = result.verdict === "accepted" ? 0 : 1;
}

function printResult(result: ExecutionResult) {
  console.log(`\n${result.verdict.toUpperCase()} — ${result.score}/${result.maxScore} pontos — ${result.durationMs} ms`);
  for (const test of result.cases) console.log(`  ${test.passed ? "✓" : "✗"} ${test.name}${test.message ? ` — ${test.message}` : ""}`);
  if (result.message) console.log(`\n${result.message}`);
}

function usage() {
  console.log(`
Silogium CLI

  silogium auth <token>
  silogium pull <slug> [--runtime ts|py] [--dir pasta] [--force] [--access-key chave]
  silogium test [--stage 1]
  silogium submit
  silogium submissions [id]
`);
}

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") return usage();
  const takesPositional = command === "auth" || command === "pull" || command === "submissions";
  const positional = takesPositional && rawArgs[0] && !rawArgs[0].startsWith("-") ? rawArgs.shift() : undefined;
  const parsed = parseArgs({ args: rawArgs, options: { runtime: { type: "string" }, dir: { type: "string" }, stage: { type: "string" }, force: { type: "boolean" }, "access-key": { type: "string" } }, strict: false });
  if (command === "auth") return authenticate(positional);
  if (command === "pull") return pull(positional, parsed.values.runtime as string | undefined, parsed.values.dir as string | undefined, Boolean(parsed.values.force), parsed.values["access-key"] as string | undefined);
  if (command === "test") return testLocally(parsed.values.stage as string | undefined);
  if (command === "submit") return submit();
  if (command === "submissions") return console.log(positional ? await api(`/executions/${positional}`) : await api("/executions"));
  throw new Error(`Comando desconhecido: ${command}`);
}

main().catch((error) => { console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
