import { ExecutionResultSchema, sanitizeExecutionResult, type ExecutionRequest, type ExecutionResult, type JudgeBundle, type ProblemDefinition } from "@silogium/core";
import type { Judge } from "./types.js";
import { scoreOutcomes } from "./scoring.js";

const PROTOCOL_VERSION = 2;
const RESPONSE_BYTES = 66 * 1024; // bounded controller result plus the v2 envelope

async function readResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Resposta vazia do judge remoto.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_BYTES) throw new Error("Resposta do judge excedeu o limite de transporte.");
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function verifyResult(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest, result: ExecutionResult) {
  const selected = (request.kind === "run" ? bundle.visibleCases : [...bundle.visibleCases, ...bundle.hiddenCases])
    .filter((test) => request.maxStage === undefined || test.stage <= request.maxStage);
  if (result.verdict !== "accepted" && result.verdict !== "wrong_answer") {
    if (result.cases.length || result.score !== 0 || result.maxScore !== 0) throw new Error("Falha do judge com pontuação inconsistente.");
    return;
  }
  const inventory = new Map(selected.map((test) => [test.id, test]));
  if (!selected.length || inventory.size !== selected.length || result.cases.length !== selected.length
    || new Set(result.cases.map((test) => test.id)).size !== selected.length
    || result.cases.some((test) => inventory.get(test.id)?.stage !== test.stage || (test.passed && test.mismatch !== undefined))) {
    throw new Error("Inventário de casos inconsistente na resposta do judge.");
  }
  const accepted = result.cases.every((test) => test.passed);
  const score = scoreOutcomes(problem, result.cases);
  if ((result.verdict === "accepted") !== accepted || result.score !== score.score || result.maxScore !== score.maxScore) {
    throw new Error("Veredito ou pontuação inconsistente na resposta do judge.");
  }
}

export class ModalJudgeAdapter implements Judge {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  async evaluate(problem: ProblemDefinition, bundle: JudgeBundle, request: ExecutionRequest): Promise<ExecutionResult> {
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        // Only the authenticated controller receives fixtures. This is NOT the
        // candidate sandbox payload. No statements, starters or references needed.
        body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId,
          problem: { id: problem.id, version: problem.version, executionModel: problem.executionModel,
            stages: problem.stages.map(({ number, points }) => ({ number, points })), limits: problem.limits,
            runtimes: problem.runtimes.map(({ language, entrypoint }) => ({ language, entrypoint })) },
          bundle: { problemId: bundle.problemId, problemVersion: bundle.problemVersion,
            visibleCases: bundle.visibleCases, hiddenCases: request.kind === "submission" ? bundle.hiddenCases : [] },
          request }),
        signal: AbortSignal.timeout(35_000)
      });
      if (!response.ok) throw new Error(`Modal respondeu HTTP ${response.status}.`);
      const envelope = await readResponse(response) as { protocolVersion?: unknown; requestId?: unknown; result?: unknown } | null;
      if (!envelope || envelope.protocolVersion !== PROTOCOL_VERSION || envelope.requestId !== requestId) {
        throw new Error("Protocolo do judge incompatível. Publique o controlador Modal v2 antes de habilitar execuções remotas.");
      }
      const result = ExecutionResultSchema.parse(envelope.result);
      verifyResult(problem, bundle, request, result);
      return sanitizeExecutionResult(result, bundle, request.kind);
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
