import { ExecutionApiRequestSchema, ExecutionRequestSchema, prepareExecutionBundle, sanitizeExecutionResult } from "@silogium/core";
import { createJudgeFromEnv } from "@silogium/judge";
import { getActor } from "@/lib/actor";
import { getAuthoringRepository } from "@/lib/authoring";
import { loadVisibleBundle } from "@/lib/bundles";
import { listExecutionPage, saveExecution } from "@/lib/executions";
import { attachExecutionProblemMetadata } from "@/lib/execution-metadata";
import { consumeQuota, refundQuota } from "@/lib/usage";
import { executionEvidence } from "@/lib/durable-progress";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let chargedActor: string | undefined;
  try {
    const actor = await getActor(request);
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 1_048_576) throw new Error("A execução excedeu o tamanho máximo permitido.");
    const apiInput = ExecutionApiRequestSchema.parse(JSON.parse(text));
    const input = ExecutionRequestSchema.parse(apiInput);
    const value = await getAuthoringRepository().getPackageVersion(input.problemId, input.problemVersion, actor, apiInput.accessKey);
    if (!value || value.problem.version !== input.problemVersion) throw new Error("Questão ou versão não encontrada.");
    const problem = value.problem;
    const officialBundle = value.bundle.visibleCases.length ? value.bundle : loadVisibleBundle(problem.slug);
    const bundle = prepareExecutionBundle(problem, officialBundle, apiInput);
    const quota = await consumeQuota(actor.id, "remote_execution");
    if (!quota.allowed) return Response.json({ id: crypto.randomUUID(), verdict: "system_error", score: 0, maxScore: 0, durationMs: 0, cases: [], message: "Limite de execuções atingido." }, { status: 429 });
    chargedActor = actor.id;
    let result;
    try {
      result = sanitizeExecutionResult(await createJudgeFromEnv().evaluate(problem, bundle, input), bundle, input.kind);
    } catch (error) {
      chargedActor = undefined;
      await refundQuota(actor.id, "remote_execution");
      throw error;
    }
    if (result.verdict === "system_error") { chargedActor = undefined; await refundQuota(actor.id, "remote_execution"); }
    if (input.kind === "submission" && bundle.hiddenCases.length === 0 && result.verdict !== "system_error") {
      result.message = "Ambiente local: esta submissão usou apenas fixtures públicas. Configure o bundle privado no ambiente remoto para o veredito oficial.";
    }
    const evidence = executionEvidence({ actor, problem, bundle, request: input, result,
      persistent: Boolean(createSupabaseAdminClient()),
      trustedJudgePolicy: process.env.MODAL_JUDGE_ENDPOINT ? process.env.SILOGIUM_VERIFIED_JUDGE_POLICY : undefined });
    await saveExecution(actor.id, input, result, evidence);
    chargedActor = undefined;
    return Response.json(result);
  } catch (error) {
    if (chargedActor) { try { await refundQuota(chargedActor, "remote_execution"); } catch { /* Original failure remains actionable; refund requires operational retry. */ } }
    return Response.json({ id: crypto.randomUUID(), verdict: "system_error", score: 0, maxScore: 0, durationMs: Date.now() - startedAt, cases: [], message: error instanceof Error ? error.message : "Falha inesperada." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(request);
    const query = new URL(request.url).searchParams;
    const kind = query.get("kind");
    const outcome = query.get("outcome");
    if (kind && kind !== "run" && kind !== "submission") throw new Error("Tipo de atividade inválido.");
    if (outcome && outcome !== "accepted" && outcome !== "failed") throw new Error("Filtro de resultado inválido.");
    const page = await listExecutionPage(actor.id, { cursor: query.get("cursor") ?? undefined, limit: query.has("limit") ? Number(query.get("limit")) : 50,
      problemId: query.get("problemId") ?? undefined, problemVersion: query.has("problemVersion") ? Number(query.get("problemVersion")) : undefined,
      kind: kind === "run" || kind === "submission" ? kind : undefined, outcome: outcome === "accepted" || outcome === "failed" ? outcome : undefined });
    const repository = getAuthoringRepository();
    return Response.json({
      ...page, historyLimit: page.limit,
      executions: await attachExecutionProblemMetadata(page.executions, async (id) => (await repository.getPackageById(id, actor))?.problem)
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
