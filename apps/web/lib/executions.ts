import type { ExecutionRequest, ExecutionResult } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";

type StoredExecution = { actorId: string; request: Omit<ExecutionRequest, "source">; result: ExecutionResult; createdAt: string };
const globalExecutions = globalThis as typeof globalThis & { __silogiumExecutions?: Map<string, StoredExecution> };
const executions = globalExecutions.__silogiumExecutions ??= new Map<string, StoredExecution>();

export async function saveExecution(actorId: string, request: ExecutionRequest, result: ExecutionResult) {
  const { source: _source, ...safeRequest } = request;
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.from("submissions").insert({
      id: result.id,
      user_id: actorId,
      problem_id: request.problemId,
      problem_version: request.problemVersion,
      runtime: request.runtime,
      kind: request.kind,
      source: request.source,
      verdict: result.verdict,
      score: result.score,
      max_score: result.maxScore,
      duration_ms: result.durationMs,
      result,
      completed_at: new Date().toISOString()
    });
    if (error) throw new Error(`Não foi possível salvar a submissão: ${error.message}`);
  }
  executions.set(result.id, { actorId, request: safeRequest, result, createdAt: new Date().toISOString() });
}

export async function getExecution(actorId: string, id: string, isAdmin = false) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    let query = admin.from("submissions").select("id,user_id,problem_id,problem_version,runtime,kind,verdict,score,max_score,duration_ms,result,created_at").eq("id", id);
    if (!isAdmin) query = query.eq("user_id", actorId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Não foi possível ler a submissão: ${error.message}`);
    if (!data) return null;
    return { actorId: data.user_id, request: { problemId: data.problem_id, problemVersion: data.problem_version, runtime: data.runtime, kind: data.kind }, result: data.result as ExecutionResult, createdAt: data.created_at };
  }
  const value = executions.get(id);
  return value && (value.actorId === actorId || isAdmin) ? value : null;
}

export async function listExecutions(actorId: string, isAdmin = false) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    let query = admin.from("submissions").select("id,user_id,problem_id,problem_version,runtime,kind,result,created_at").order("created_at", { ascending: false }).limit(100);
    if (!isAdmin) query = query.eq("user_id", actorId);
    const { data, error } = await query;
    if (error) throw new Error(`Não foi possível listar submissões: ${error.message}`);
    return (data ?? []).map((row) => ({ actorId: row.user_id, request: { problemId: row.problem_id, problemVersion: row.problem_version, runtime: row.runtime, kind: row.kind }, result: row.result as ExecutionResult, createdAt: row.created_at }));
  }
  return [...executions.values()].filter((item) => isAdmin || item.actorId === actorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
