import { CapacityUnavailableError, JudgeBundleSchema, ProblemDefinitionSchema, type ExecutionRequest, type ExecutionResult, type JudgeBundle, type ProblemDefinition } from "@silogium/core";
import type { ProblemValidator, ValidationReport } from "./types.js";
import { buildQualityMutations, fixturesAreConsistent, inspectCoverage, isJsonFixture } from "./quality.js";

export class StructuralProblemValidator implements ProblemValidator {
  constructor(private readonly executor?: { evaluate(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest): Promise<ExecutionResult> }) {}

  async validate(rawProblem: ProblemDefinition, rawBundle: JudgeBundle): Promise<ValidationReport> {
    const checks: ValidationReport["checks"] = [];
    const warnings: string[] = [];
    let infrastructureError = false;
    const definition = ProblemDefinitionSchema.safeParse(rawProblem);
    checks.push({ name: "schema da questão", passed: definition.success, message: definition.success ? undefined : definition.error.issues[0]?.message });
    const judge = JudgeBundleSchema.safeParse(rawBundle);
    checks.push({ name: "schema do judge", passed: judge.success, message: judge.success ? undefined : judge.error.issues[0]?.message });
    if (!definition.success || !judge.success) return { valid: false, checks };
    const problem = definition.data;
    const bundle = judge.data;
    const cases = [...bundle.visibleCases, ...bundle.hiddenCases];
    checks.push({ name: "fixtures serializáveis em JSON", passed: isJsonFixture(cases), message: "Entradas e respostas devem ser JSON finito, sem undefined ou referências circulares." });
    if (!checks.at(-1)!.passed) return { valid: false, checks };
    checks.push({ name: "identidade do bundle", passed: bundle.problemId === problem.id && bundle.problemVersion === problem.version });
    checks.push({ name: "origem e proveniência", passed: problem.origin === problem.provenance.kind });
    checks.push({ name: "estágios consecutivos", passed: problem.stages.every((stage, index) => stage.number === index + 1) });
    checks.push({ name: "pontuação positiva", passed: problem.stages.every((stage) => stage.points > 0) });
    checks.push({ name: "testes visíveis", passed: bundle.visibleCases.length > 0, message: bundle.visibleCases.length ? undefined : "Inclua pelo menos um teste visível." });
    checks.push({ name: "testes ocultos", passed: bundle.hiddenCases.length > 0, message: bundle.hiddenCases.length ? undefined : "Inclua pelo menos um teste oculto." });
    checks.push({ name: "identificadores únicos dos testes", passed: new Set(cases.map((test) => test.id)).size === cases.length });
    const stages = new Set(problem.stages.map((stage) => stage.number));
    checks.push({
      name: "cobertura dos estágios",
      passed: cases.every((item) => stages.has(item.stage))
    });
    checks.push({ name: "modelo de execução das fixtures", passed: cases.every((test) => test.kind === problem.executionModel) });
    if (bundle.authoringContract) {
      const contract = bundle.authoringContract;
      checks.push({ name: "contrato progressivo", passed: problem.executionModel === "call-sequence"
        && new Set(contract.methods.map(m => m.name)).size === contract.methods.length
        && contract.methods.every(m => stages.has(m.stage))
        && [contract.constructorParameters, ...contract.methods.map(m => m.parameters)].every(p => new Set(p).size === p.length)
        && problem.runtimes.every(r => r.entrypoint.kind === "class" && r.entrypoint.symbol === contract.symbol)
        && cases.every(test => test.kind === "call-sequence" && test.constructorArgs.length === contract.constructorParameters.length
          && test.calls.every(call => contract.methods.some(m => m.name === call.method && m.stage <= test.stage && m.parameters.length === call.args.length))) });
    }
    checks.push({ name: "respostas determinísticas consistentes", passed: problem.runtimes.every((runtime) => fixturesAreConsistent(cases, runtime.language)), message: "A mesma entrada ou prefixo de chamadas não pode exigir respostas diferentes." });
    for (const stage of problem.stages) {
      const cases = [...bundle.visibleCases, ...bundle.hiddenCases].filter((item) => item.stage === stage.number);
      checks.push({ name: `casos do nível ${stage.number}`, passed: cases.length > 0, message: cases.length ? undefined : "Cada nível precisa de ao menos um caso." });
    }
    for (const runtime of problem.runtimes) {
      const reference = bundle.referenceSolutions[runtime.language];
      checks.push({ name: `entrypoint ${runtime.language}`, passed: (problem.executionModel === "stdio") === (runtime.entrypoint.kind === "stdio") });
      checks.push({ name: `referência ${runtime.language}`, passed: Boolean(reference?.trim()), message: reference?.trim() ? undefined : "A solução de referência é obrigatória." });
    }
    if (checks.some((check) => !check.passed)) return { valid: false, checks };
    const coverage = inspectCoverage(bundle);
    warnings.push("Indícios de casos extremos não comprovam cobertura completa. Clareza, dificuldade e limites válidos ainda exigem revisão editorial.");
    if (coverage.distinctInputs < 3) warnings.push("Poucas entradas distintas: amplie os testes com limites e situações relevantes ao enunciado.");
    if (!this.executor) {
      warnings.push("Validação apenas estrutural: referências, starters e mutantes não foram executados.");
      return { valid: true, checks, warnings, coverage };
    }
    for (const runtime of problem.runtimes) {
      const base = { problemId: problem.id, problemVersion: problem.version, runtime: runtime.language, kind: "submission" } as const;
      const evaluate = async (source: string): Promise<ExecutionResult | null> => {
        try {
          const result = await this.executor!.evaluate(problem, bundle, { ...base, source });
          if (result.verdict === "system_error") infrastructureError = true;
          return result;
        } catch (error) {
          if (error instanceof CapacityUnavailableError) throw error;
          infrastructureError = true; return null;
        }
      };
      const referenceResult = await evaluate(bundle.referenceSolutions[runtime.language]!);
      const referencePassed = referenceResult?.verdict === "accepted" && referenceResult.cases.length === cases.length
        && new Set(referenceResult.cases.map((item) => item.id)).size === cases.length
        && cases.every((test) => referenceResult.cases.some((outcome) => outcome.id === test.id && outcome.stage === test.stage && outcome.passed));
      checks.push({
        name: `referência passa em ${runtime.language}`,
        passed: referencePassed,
        message: referencePassed ? undefined : `A referência não confirmou todos os casos (${referenceResult?.verdict ?? "system_error"}).`
      });
      if (!referencePassed) continue;
      const starterResult = await evaluate(runtime.starterCode);
      const starterRunnable = Boolean(starterResult && ["accepted", "wrong_answer"].includes(starterResult.verdict));
      checks.push({
        name: `starter compila e executa em ${runtime.language}`,
        passed: starterRunnable,
        message: starterRunnable ? undefined : starterResult?.verdict ?? "system_error"
      });
      checks.push({
        name: `testes rejeitam implementação defeituosa em ${runtime.language}`,
        passed: starterResult?.verdict === "wrong_answer",
        message: starterResult?.verdict === "accepted" ? "O starter passou em todos os casos; os testes não detectaram a falha." : undefined
      });
      for (const mutation of buildQualityMutations(runtime, bundle)) {
        if (!mutation.source) {
          coverage.mutationChecks.push({ runtime: runtime.language, name: mutation.name, status: "not_applicable" });
          continue;
        }
        const result = await evaluate(mutation.source);
        const observedFailure = result?.cases.some((outcome) => !outcome.passed && cases.some((test) => test.id === outcome.id && test.stage === outcome.stage));
        const status = result?.verdict === "wrong_answer" && observedFailure ? "killed" : result?.verdict === "accepted" ? "survived" : "inconclusive";
        coverage.mutationChecks.push({ runtime: runtime.language, name: mutation.name, status });
        checks.push({ name: `mutante ${mutation.name} em ${runtime.language}`, passed: status === "killed", message: status === "inconclusive" ? "Falha de execução/infra não conta como mutante detectado." : status === "survived" ? "Os testes aceitaram uma variante sabidamente defeituosa." : undefined });
      }
    }
    return { valid: checks.every((check) => check.passed), checks, warnings, coverage, ...(infrastructureError ? { infrastructureError: true } : {}) };
  }
}
