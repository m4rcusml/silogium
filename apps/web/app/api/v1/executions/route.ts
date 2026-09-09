import { ExecutionRequestSchema } from "@silogium/core";
import { createJudgeFromEnv } from "@silogium/judge";
import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";
import { loadVisibleBundle } from "@/lib/bundles";
import { listExecutions, saveExecution } from "@/lib/executions";
import { consumeQuota, refundQuota } from "@/lib/usage";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const actor = await getActor(request);
    const body = await request.json() as Record<string, unknown>;
    const accessKey = typeof body.accessKey === "string" ? body.accessKey : undefined;
    const { accessKey: _accessKey, ...rawInput } = body;
    const input = ExecutionRequestSchema.parse(rawInput);
    const value = await getAuthoringRepository().getPackageById(input.problemId, actor, accessKey);
    if (!value || value.problem.version !== input.problemVersion) throw new Error("Questão ou versão não encontrada.");
    const problem = value.problem;
    const bundle = value.bundle.visibleCases.length ? value.bundle : loadVisibleBundle(problem.slug);
    const quota = await consumeQuota(actor.id, "remote_execution");
    if (!quota.allowed) return Response.json({ id: crypto.randomUUID(), verdict: "system_error", score: 0, maxScore: 0, durationMs: 0, cases: [], message: "Limite de execuções atingido." }, { status: 429 });
    let result;
    try {
      result = await createJudgeFromEnv().evaluate(problem, bundle, input);
    } catch (error) {
      await refundQuota(actor.id, "remote_execution");
      throw error;
    }
    if (result.verdict === "system_error") await refundQuota(actor.id, "remote_execution");
    if (input.kind === "submission" && bundle.hiddenCases.length === 0 && result.verdict !== "system_error") {
      result.message = "Ambiente local: esta submissão usou apenas fixtures públicas. Configure o bundle privado no ambiente remoto para o veredito oficial.";
    }
    await saveExecution(actor.id, input, result);
    return Response.json(result);
  } catch (error) {
    return Response.json({ id: crypto.randomUUID(), verdict: "system_error", score: 0, maxScore: 0, durationMs: Date.now() - startedAt, cases: [], message: error instanceof Error ? error.message : "Falha inesperada." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    return Response.json({ executions: await listExecutions(actor.id, actor.role === "admin") });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
