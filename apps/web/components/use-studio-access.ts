"use client";

import { useEffect, useState } from "react";
import type { StudioAccess } from "../lib/studio-access";
import { readStudioResponse, studioError } from "./studio-request";

export function useStudioAccess(actorId: string | undefined, initialAccess: StudioAccess | undefined, refreshKey: string) {
  const [access, setAccess] = useState(initialAccess);
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setAccess(initialAccess); setError(undefined); }, [actorId, initialAccess]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setRefreshing(true);
    fetch("/api/v1/studio/status", { cache: "no-store", signal: controller.signal })
      .then(response => readStudioResponse<StudioAccess>(response, "Não foi possível conferir o saldo"))
      .then(value => {
        if (!value.features || !["search", "create", "refine", "import"].every(key => typeof value.features[key as keyof typeof value.features]?.available === "boolean")) throw new Error("A consulta não informou a disponibilidade. Atualize antes de enviar.");
        if (active) { setAccess(value); setError(undefined); }
      })
      .catch(caught => { if (active) setError(controller.signal.aborted ? "A consulta de acesso demorou a responder. Atualize o saldo antes de enviar um novo pedido." : studioError(caught)); })
      .finally(() => { clearTimeout(timeout); if (active) setRefreshing(false); });
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [actorId, refreshKey, revision]);
  useEffect(() => {
    if (!access?.beta) return;
    const delay = Date.parse(access.beta.resetsAt) - Date.now();
    if (!Number.isFinite(delay) || delay < 0 || delay > 86_400_000) return;
    const timer = setTimeout(() => setRevision(value => value + 1), delay + 1_000);
    return () => clearTimeout(timer);
  }, [access?.beta?.resetsAt]);
  return { access, error, refreshing, refresh: () => setRevision(value => value + 1) };
}
