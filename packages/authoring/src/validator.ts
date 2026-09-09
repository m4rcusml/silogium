import { JudgeBundleSchema, ProblemDefinitionSchema, type ExecutionRequest, type ExecutionResult, type JudgeBundle, type ProblemDefinition } from "@silogium/core";
import type { ProblemValidator, ValidationReport } from "./types.js";

export class StructuralProblemValidator implements ProblemValidator {
  constructor(private readonly executor?: { evaluate(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest): Promise<ExecutionResult> }) {}

  async validate(problem: ProblemDefinition, bundle: JudgeBundle): Promise<ValidationReport> {
    const checks: ValidationReport["checks"] = [];
    const definition = ProblemDefinitionSchema.safeParse(problem);
    checks.push({ name: "schema da questão", passed: definition.success, message: definition.success ? undefined : definition.error.issues[0]?.message });
    const judge = JudgeBundleSchema.safeParse(bundle);
    checks.push({ name: "schema do judge", passed: judge.success, message: judge.success ? undefined : judge.error.issues[0]?.message });
    checks.push({ name: "identidade do bundle", passed: bundle.problemId === problem.id && bundle.problemVersion === problem.version });
    checks.push({ name: "testes visíveis", passed: bundle.visibleCases.length > 0, message: bundle.visibleCases.length ? undefined : "Inclua pelo menos um teste visível." });
    checks.push({ name: "testes ocultos", passed: bundle.hiddenCases.length > 0, message: bundle.hiddenCases.length ? undefined : "Inclua pelo menos um teste oculto." });
    const maxStage = Math.max(...problem.stages.map((stage) => stage.number));
    checks.push({
      name: "cobertura dos estágios",
      passed: [...bundle.visibleCases, ...bundle.hiddenCases].every((item) => item.stage >= 1 && item.stage <= maxStage)
    });
    for (const stage of problem.stages) {
      const cases = [...bundle.visibleCases, ...bundle.hiddenCases].filter((item) => item.stage === stage.number);
      checks.push({ name: `casos do nível ${stage.number}`, passed: cases.length > 0, message: cases.length ? undefined : "Cada nível precisa de ao menos um caso." });
    }
    for (const runtime of problem.runtimes) {
      const reference = bundle.referenceSolutions[runtime.language];
      checks.push({ name: `referência ${runtime.language}`, passed: Boolean(reference?.trim()), message: reference?.trim() ? undefined : "A solução de referência é obrigatória." });
      if (!this.executor || !reference?.trim()) continue;
      const base = { problemId: problem.id, problemVersion: problem.version, runtime: runtime.language } as const;
      const referenceResult = await this.executor.evaluate(problem, bundle, { ...base, kind: "submission", source: reference });
      checks.push({
        name: `referência passa em ${runtime.language}`,
        passed: referenceResult.verdict === "accepted",
        message: referenceResult.verdict === "accepted" ? undefined : referenceResult.message ?? referenceResult.verdict
      });
      const starterResult = await this.executor.evaluate(problem, bundle, { ...base, kind: "submission", source: runtime.starterCode });
      checks.push({
        name: `starter compila em ${runtime.language}`,
        passed: !new Set(["compile_error", "runtime_error", "system_error"]).has(starterResult.verdict),
        message: new Set(["compile_error", "runtime_error", "system_error"]).has(starterResult.verdict) ? starterResult.message ?? starterResult.verdict : undefined
      });
      checks.push({
        name: `testes rejeitam implementação defeituosa em ${runtime.language}`,
        passed: starterResult.verdict !== "accepted",
        message: starterResult.verdict === "accepted" ? "O starter passou em todos os casos; os testes não detectaram a falha." : undefined
      });
    }
    return { valid: checks.every((check) => check.passed), checks };
  }
}
