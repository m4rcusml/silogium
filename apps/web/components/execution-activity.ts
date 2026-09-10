"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExecutionResultSchema, type ExecutionRequest, type ExecutionResult, type ProblemDefinition, type Verdict } from "@silogium/core";
import { catalogProgressForProblem, summarizeCatalogProgress, type ProblemProgress } from "../lib/catalog-progress";
export type { ProblemProgress } from "../lib/catalog-progress";

export type ExecutionActivityItem = {
  createdAt: string;
  request: Omit<ExecutionRequest, "source">;
  result: ExecutionResult;
  problem?: Pick<ProblemDefinition, "id" | "title" | "slug" | "version">;
  codeAvailable?: boolean;
  verification?: string;
};

export type ExecutionActivity = {
  items: ExecutionActivityItem[];
  state: "loading" | "ready" | "unauthenticated" | "error";
  error?: string;
  historyLimit?: number;
  refresh: () => void;
  loadMore?: () => void;
  loadingMore?: boolean;
  nextCursor?: string | null;
  total?: number;
  pageError?: string;
};

export const verdictLabels: Record<Verdict, string> = {
  accepted: "Aceita", wrong_answer: "Resposta incorreta", compile_error: "Erro de compilação",
  runtime_error: "Erro de execução", time_limit: "Tempo excedido", memory_limit: "Memória excedida",
  output_limit: "Saída excedida", system_error: "Erro do sistema"
};

function parseItems(input: unknown): ExecutionActivityItem[] {
  if (!Array.isArray(input)) throw new Error("O histórico retornou uma resposta inválida.");
  return input.map((item: ExecutionActivityItem) => {
    const request = item?.request;
    if (!request || typeof request.problemId !== "string" || !Number.isInteger(request.problemVersion)
      || !["typescript", "python"].includes(request.runtime) || !["run", "submission"].includes(request.kind)
      || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) {
      throw new Error("O histórico retornou uma resposta inválida.");
    }
    return { ...item, result: ExecutionResultSchema.parse(item.result) };
  });
}

export function useExecutionActivity(enabled = true, filters: { problemId?: string; problemVersion?: number; kind?: string; outcome?: string } = {}): ExecutionActivity {
  const [items, setItems] = useState<ExecutionActivityItem[]>([]);
  const [state, setState] = useState<ExecutionActivity["state"]>("loading");
  const [error, setError] = useState<string>();
  const [historyLimit, setHistoryLimit] = useState<number>(100);
  const [revision, setRevision] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string>();
  const generation = useRef(0);
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== "all").map(([key, value]) => [key, String(value)])).toString();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const current = ++generation.current;
    const controller = new AbortController();
    setState("loading");
    setError(undefined);
    setPageError(undefined);
    setLoadingMore(false);
    setNextCursor(null);
    void fetch(`/api/v1/executions${query ? `?${query}` : ""}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (response.status === 401) {
        setItems([]);
        setState("unauthenticated");
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o histórico.");
      const executions = parseItems(body.executions);
      if (controller.signal.aborted || current !== generation.current) return;
      setItems(executions.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
      if (typeof body.historyLimit === "number") setHistoryLimit(body.historyLimit);
      setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
      setTotal(typeof body.total === "number" ? body.total : undefined);
      setState("ready");
    }).catch((reason) => {
      if (controller.signal.aborted) return;
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o histórico.");
      setState("error");
    });
    return () => { controller.abort(); generation.current++; };
  }, [enabled, revision, query]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore || !enabled) return;
    const current = generation.current;
    setLoadingMore(true);
    setPageError(undefined);
    const params = new URLSearchParams(query);
    params.set("cursor", nextCursor);
    void fetch(`/api/v1/executions?${params}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar mais atividades.");
      const page = parseItems(body.executions);
      if (current !== generation.current) return;
      setItems((previous) => [...new Map([...previous, ...page].map((item) => [item.result.id, item])).values()]);
      setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
      if (typeof body.total === "number") setTotal(body.total);
    }).catch((reason) => { if (current === generation.current) setPageError(reason instanceof Error ? reason.message : "Falha ao carregar a próxima página."); })
      .finally(() => { if (current === generation.current) setLoadingMore(false); });
  }, [nextCursor, loadingMore, enabled, query]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("silogium:execution-saved", refresh);
    return () => window.removeEventListener("silogium:execution-saved", refresh);
  }, [enabled, refresh]);

  return { items, state, error, historyLimit, refresh, loadMore, loadingMore, nextCursor, total, pageError };
}

export function progressForProblem(problem: ProblemDefinition, items: ExecutionActivityItem[]): ProblemProgress {
  return catalogProgressForProblem(problem, summarizeCatalogProgress(items));
}
