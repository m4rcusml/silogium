import { ExecutionResultSchema, type ExecutionRequest, type ExecutionResult, type JudgeBundle, type ProblemDefinition } from "@silogium/core";
import type { Judge } from "./types.js";

export class ModalJudgeAdapter implements Judge {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  async evaluate(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest): Promise<ExecutionResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        body: JSON.stringify({ problem, bundle, request }),
        signal: AbortSignal.timeout(35_000)
      });
      if (!response.ok) throw new Error(`Modal respondeu HTTP ${response.status}.`);
      return ExecutionResultSchema.parse(await response.json());
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        verdict: "system_error",
        score: 0,
        maxScore: 0,
        durationMs: 0,
        cases: [],
        message: error instanceof Error ? error.message : "Falha ao acessar o judge remoto."
      };
    }
  }
}

export class UnavailableJudgeAdapter implements Judge {
  async evaluate(): Promise<ExecutionResult> {
    return {
      id: crypto.randomUUID(),
      verdict: "system_error",
      score: 0,
      maxScore: 0,
      durationMs: 0,
      cases: [],
      message: "Configure MODAL_JUDGE_ENDPOINT ou habilite SILOGIUM_ALLOW_LOCAL_EXECUTION apenas em desenvolvimento."
    };
  }
}
