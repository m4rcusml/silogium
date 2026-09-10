import type { ExecutionRequest, ExecutionResult, PracticeEvidence } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin.js";

export type StoredExecution = { actorId: string; request: Omit<ExecutionRequest, "source">; result: ExecutionResult; createdAt: string; source?: string; evidence?: PracticeEvidence };
export type ExecutionFilters = { problemId?: string; problemVersion?: number; kind?: "run" | "submission"; outcome?: "accepted" | "failed" };
type SummaryExecution = Omit<StoredExecution, "source" | "evidence"> & { codeAvailable: boolean; verification: string };
export type ExecutionPage = { executions: SummaryExecution[]; nextCursor: string | null; total: number; limit: number };
const state = globalThis as typeof globalThis & { __silogiumExecutions?: Map<string, StoredExecution> };
const executions = state.__silogiumExecutions ??= new Map<string, StoredExecution>();
const columns = "id,user_id,problem_id,problem_version,runtime,kind,result,created_at,max_stage,practice_evidence,source_available";

export function exportMemoryExecutions(): StoredExecution[] { return structuredClone([...executions.values()]); }
export function executionPageCursor(value: { createdAt: string; result: { id: string } }) { return Buffer.from(JSON.stringify([value.createdAt, value.result.id])).toString("base64url"); }

function readCursor(value?: string) {
  if (!value) return undefined;
  try {
    if (value.length > 512 || !/^[\w-]+$/.test(value)) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== "string" || !Number.isFinite(Date.parse(decoded[0]))
      || typeof decoded[1] !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(decoded[1])) throw new Error();
    return { at: new Date(decoded[0]).toISOString(), id: decoded[1] };
  } catch { throw new Error("Cursor de histórico inválido."); }
}
function safe(item: StoredExecution, sourceAvailable = item.source !== undefined): SummaryExecution {
  return { actorId: item.actorId, request: { ...item.request }, result: item.result, createdAt: item.createdAt, codeAvailable: sourceAvailable, verification: item.evidence?.verification.kind ?? "legacy_unverified" };
}
function fromRow(row: Record<string, any>): StoredExecution {
  return { actorId: row.user_id, request: { problemId: row.problem_id, problemVersion: row.problem_version, runtime: row.runtime, kind: row.kind, ...(row.max_stage != null ? { maxStage: row.max_stage } : {}) },
    result: row.result as ExecutionResult, createdAt: row.created_at, ...(typeof row.source === "string" && row.source_available !== false ? { source: row.source } : {}), ...(row.practice_evidence ? { evidence: row.practice_evidence as PracticeEvidence } : {}) };
}

export async function saveExecution(actorId: string, request: ExecutionRequest, result: ExecutionResult, evidence?: PracticeEvidence) {
  const { source, ...safeRequest } = request;
  if (evidence && (evidence.userId !== actorId || evidence.submissionId !== result.id || evidence.problemId !== request.problemId || evidence.problemVersion !== request.problemVersion || evidence.runtime !== request.runtime || evidence.kind !== request.kind || evidence.verdict !== result.verdict)) throw new Error("A evidência não corresponde à submissão finalizada.");
  const item: StoredExecution = { actorId, request: safeRequest, result, source, createdAt: evidence?.occurredAt ?? new Date().toISOString(), ...(evidence ? { evidence } : {}) };
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.rpc("finalize_practice_submission", { payload: { id: result.id, user_id: actorId, problem_id: request.problemId, problem_version: request.problemVersion,
      runtime: request.runtime, kind: request.kind, source, max_stage: request.maxStage ?? null, verdict: result.verdict, score: result.score, max_score: result.maxScore, duration_ms: result.durationMs,
      result, practice_evidence: evidence ?? null, created_at: item.createdAt } });
    if (error) throw new Error(`Não foi possível persistir a submissão e sua evidência. Verifique a migração de prática. ${error.message}`);
  } else {
    const existing = executions.get(result.id);
    if (existing) {
      if (existing.actorId !== actorId || JSON.stringify(existing.request) !== JSON.stringify(safeRequest) || existing.source !== source || JSON.stringify(existing.result) !== JSON.stringify(result) || JSON.stringify(existing.evidence) !== JSON.stringify(evidence)) throw new Error("Identificador de submissão já utilizado.");
      return;
    }
  }
  executions.set(result.id, structuredClone(item));
}

export async function getExecution(actorId: string, id: string, isAdmin = false) {
  const admin = createSupabaseAdminClient();
  let item: StoredExecution | undefined;
  if (admin) {
    let query = admin.from("submissions").select(`${columns},source`).eq("id", id);
    if (!isAdmin) query = query.eq("user_id", actorId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Não foi possível ler a submissão: ${error.message}`);
    if (data) item = fromRow(data);
  } else { const found = executions.get(id); if (found && (found.actorId === actorId || isAdmin)) item = structuredClone(found); }
  return item ? { ...safe(item), ...(item.source !== undefined ? { source: item.source } : {}) } : null;
}

export async function listExecutionPage(actorId: string, options: ExecutionFilters & { cursor?: string; limit?: number } = {}): Promise<ExecutionPage> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("O tamanho da página deve ser entre 1 e 100.");
  if (options.problemId && !/^[\w-]{1,100}$/.test(options.problemId)) throw new Error("Questão inválida.");
  if (options.problemVersion !== undefined && (!Number.isInteger(options.problemVersion) || options.problemVersion < 1)) throw new Error("Versão inválida.");
  const cursor = readCursor(options.cursor);
  const admin = createSupabaseAdminClient();
  if (admin) {
    const base = (count = false) => {
      let query = admin.from("submissions").select(columns, count ? { count: "exact", head: true } : undefined).eq("user_id", actorId);
      if (options.problemId) query = query.eq("problem_id", options.problemId);
      if (options.problemVersion) query = query.eq("problem_version", options.problemVersion);
      if (options.kind) query = query.eq("kind", options.kind);
      if (options.outcome === "accepted") query = query.eq("verdict", "accepted");
      if (options.outcome === "failed") query = query.neq("verdict", "accepted");
      return query;
    };
    let query = base().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
    const [page, count] = await Promise.all([query, base(true)]);
    if (page.error || count.error) throw new Error(`Não foi possível listar o histórico: ${page.error?.message ?? count.error?.message}`);
    const rows = page.data ?? [];
    const visible = rows.slice(0, limit).map((row) => safe(fromRow(row), row.source_available));
    return { executions: visible, total: count.count ?? 0, limit, nextCursor: rows.length > limit ? executionPageCursor(visible.at(-1)!) : null };
  }
  const all = [...executions.values()].filter((item) => item.actorId === actorId && (!options.problemId || item.request.problemId === options.problemId)
    && (!options.problemVersion || item.request.problemVersion === options.problemVersion) && (!options.kind || item.request.kind === options.kind)
    && (!options.outcome || (options.outcome === "accepted" ? item.result.verdict === "accepted" : item.result.verdict !== "accepted")))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.result.id.localeCompare(left.result.id));
  const remaining = cursor ? all.filter((item) => item.createdAt < cursor.at || (item.createdAt === cursor.at && item.result.id < cursor.id)) : all;
  const page = remaining.slice(0, limit).map((item) => safe(structuredClone(item)));
  return { executions: page, total: all.length, limit, nextCursor: remaining.length > limit ? executionPageCursor(page.at(-1)!) : null };
}

/** Compatibility for old callers; the UI uses explicit pagination. */
export async function listExecutions(actorId: string, _isAdmin = false) { return (await listExecutionPage(actorId, { limit: 100 })).executions; }

/** Backend-only full account history. Never returns submitted code. */
export async function loadPracticeHistory(actorId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return [...executions.values()].filter((item) => item.actorId === actorId).map((item) => ({ ...safe(item), evidence: item.evidence ? structuredClone(item.evidence) : undefined }));
  const items: Array<SummaryExecution & { evidence?: PracticeEvidence }> = [];
  let cursor: { at: string; id: string } | undefined;
  while (true) {
    let query = admin.from("submissions").select(columns).eq("user_id", actorId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(500);
    if (cursor) query = query.or(`created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw new Error(`Não foi possível calcular o histórico completo: ${error.message}`);
    const rows = data ?? [];
    items.push(...rows.map((row) => ({ ...safe(fromRow(row), row.source_available), evidence: row.practice_evidence as PracticeEvidence | undefined })));
    if (rows.length < 500) break;
    const last = rows.at(-1)!; cursor = { at: last.created_at, id: last.id };
  }
  return items;
}
