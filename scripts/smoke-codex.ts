import { createAiAuthoringAdapterFromEnv, resolveAiProviderConfiguration, StructuralProblemValidator } from "@silogium/authoring";
import { LocalJudgeAdapter } from "@silogium/judge";

const environment = {
  ...process.env,
  SILOGIUM_AI_PROVIDER: "codex"
};
const configuration = resolveAiProviderConfiguration(environment);
console.log(`Codex: ${configuration.model}`);
console.log("Criando uma questão clássica curta e validando starter, referência e testes...");

const adapter = createAiAuthoringAdapterFromEnv(environment);
const generated = await adapter.create({
  mode: "create",
  prompt: "Crie uma questão curta sobre contagem de frequências em uma lista de palavras.",
  runtime: "typescript",
  format: "classic",
  difficulty: "easy",
  visibility: "private"
}, { id: "codex-smoke", handle: "local", role: "admin" });

const validation = await new StructuralProblemValidator(new LocalJudgeAdapter()).validate(generated.problem, generated.bundle);
console.log(JSON.stringify({
  provider: configuration.provider,
  model: configuration.model,
  title: generated.problem.title,
  valid: validation.valid,
  failedChecks: validation.checks.filter((check) => !check.passed)
}, null, 2));

if (!validation.valid) process.exitCode = 1;
