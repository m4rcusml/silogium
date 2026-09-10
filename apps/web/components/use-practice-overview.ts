"use client";
import { useCallback, useEffect, useState } from "react";
import type { PracticeOverview } from "@/lib/practice-repository";

export function usePracticeOverview() {
  const [data, setData] = useState<PracticeOverview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(undefined);
    void fetch("/api/v1/practice", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar seu progresso.");
      if (!controller.signal.aborted) setData(body);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Progresso indisponível."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    window.addEventListener("silogium:execution-saved", refresh);
    window.addEventListener("silogium:practice-updated", refresh);
    return () => { window.removeEventListener("silogium:execution-saved", refresh); window.removeEventListener("silogium:practice-updated", refresh); };
  }, [refresh]);
  return { data, error, loading, refresh };
}
