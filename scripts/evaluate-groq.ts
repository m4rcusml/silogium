/** Opt-in real API smoke. Generated code is NEVER executed by --generate. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AiProviderError, createAiAuthoringAdapterFromEnv, StructuralProblemValidator } from "@silogium/authoring";
import { LocalJudgeAdapter } from "@silogium/judge";
import type { ContentRequest, JudgeBundle, ProblemDefinition } from "@silogium/core";

type Saved = { input: Extract<ContentRequest, { mode: "create" }>; problem: ProblemDefinition; bundle: JudgeBundle };
const actor = { id: "70000000-0000-4000-8000-000000000001", handle: "groq-eval", role: "admin" as const };
const option = (name: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
async function main() {
  const sample = option("generate"); const path = option("trusted-validate"); const repair = option("repair"); const search = option("search");
  if ([sample, path, repair, search].filter(Boolean).length !== 1) throw new Error("Use --generate=classic-ts|classic-py|progressive-ts|progressive-py, --search=pedido, --trusted-validate=arquivo ou --repair=arquivo. Revise todo código antes de autorizar execução local.");
  if (path) {
    const value: Saved = JSON.parse(await readFile(resolve(path), "utf8"));
    const report = await new StructuralProblemValidator(new LocalJudgeAdapter()).validate(value.problem, value.bundle);
    console.log(JSON.stringify({ valid: report.valid, checks: report.checks, warnings: report.warnings }, null, 2));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  const env = { ...process.env, SILOGIUM_AI_PROVIDER: "groq" };
  const adapter = createAiAuthoringAdapterFromEnv(env, { fetch: async (url, init) => {
    const began = Date.now(); const response = await fetch(url, init);
    const body = await response.clone().json().catch(() => ({}));
    if (!response.ok) {
      const diagnostics = resolve(".silogium/groq-evaluations"); await mkdir(diagnostics, { recursive: true });
      await writeFile(resolve(diagnostics, `http-${Date.now()}.private.json`), JSON.stringify(body));
    }
    console.log(JSON.stringify({ event: "groq_http", status: response.status, durationMs: Date.now() - began,
      usage: body.usage, finishReason: body.choices?.[0]?.finish_reason, category: body.error?.code }));
    return response;
  } });
  if (search) { console.log(JSON.stringify({ candidates: await adapter.searchWeb(search, "typescript", actor) }, null, 2)); return; }
  let saved: Saved;
  if (repair) {
    const previous: Saved = JSON.parse(await readFile(resolve(repair), "utf8"));
    // No code execution here. Attach diagnostics only after a separate trusted validation.
    const diagnosticPath = option("diagnostics");
    if (!diagnosticPath) throw new Error("Forneça --diagnostics=arquivo JSON com o relatório do judge após revisão do código.");
    const report = JSON.parse(await readFile(resolve(diagnosticPath), "utf8"));
    saved = { input: previous.input, ...await adapter.repair!(previous.input, actor, previous, report) };
  } else {
    if (!/^(classic|progressive)-(ts|py)$/.test(sample!)) throw new Error("Amostra inválida.");
    const progressive = sample!.startsWith("progressive");
    const input: Saved["input"] = { mode: "create", runtime: sample!.endsWith("ts") ? "typescript" : "python", format: progressive ? "progressive" : "classic", difficulty: "easy", visibility: "private",
      prompt: progressive
        ? "Crie quatro níveis curtos sobre a classe CounterStore, construtor sem argumentos. Nível 1: set(key, value) grava inteiro e retorna true, get(key) retorna inteiro ou null se ausente. Nível 2: add(key, delta) soma inteiro apenas a chave existente e retorna novo valor ou null. Nível 3: list(prefix) lista chaves com esse prefixo ordenadas lexicograficamente como array de objetos {key, value}; prefixo vazio lista todas. Nível 4: remove(key) remove e retorna true se existia, false se ausente. Chaves ASCII minúsculas não vazias, valores entre -100 e 100. Inclua testes de valores zero, negativos, ordem e remoção. Não acrescente operações nem regras. Mantenha o enunciado e as fixtures curtos."
        : "Crie uma questão curta: stdin contém um array JSON de inteiros entre -100 e 100, com até 100 elementos. Imprima a soma dos valores pares, ou 0 para vazio. Não acrescente regras. Inclua teste com negativos e zero; o título pode ser original. Use exemplos curtos." };
    saved = { input, ...await adapter.create(input, actor) };
  }
  const directory = resolve(".silogium/groq-evaluations"); await mkdir(directory, { recursive: true });
  const filename = resolve(directory, `${Date.now()}-${sample ?? "repair"}.private.json`);
  await writeFile(filename, JSON.stringify(saved, null, 2));
  console.log(JSON.stringify({ artifact: filename, format: saved.problem.format, runtime: saved.input.runtime, generated: true, codeExecuted: false }));
}
main().catch(error => {
  console.error(error instanceof AiProviderError ? `${error.code}: ${error.message}` : "Avaliação interrompida. Confira os argumentos/configuração; nenhum corpo de erro do provedor é registrado.");
  process.exitCode = 1;
});
