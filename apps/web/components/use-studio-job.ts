"use client";

import { useEffect, useRef, useState } from "react";
import type { DiscoveryMetadata, ProblemDefinition } from "@silogium/core";
import type { AuthoringRequest, ValidationReport } from "@silogium/authoring";
import { readStudioResponse, studioError } from "./studio-request";

export type Candidate = { id: string; kind: "catalog" | "licensed_import" | "external_link"; title: string; summary: string; url: string; sourceName: string; licenseSpdx?: string; importable: boolean; runtime: "typescript" | "python"; metadata?: DiscoveryMetadata; matchReasons?: string[]; similarity?: number; retrievedAt?: string; format?: "classic" | "progressive"; difficulty?: "easy" | "medium" | "hard" };
export type CreatedProblem = { problem: ProblemDefinition; accessKey?: string; validation: ValidationReport };
export type JobResult = {
  progress?: { phase: import("@silogium/authoring").AiPhase; updatedAt: string; retryAt?: string; reason?: "capacity" | "access" | "operator" | "cancelled" | "quota" };
  status: "running" | "completed" | "failed" | "needs_clarification" | "needs_confirmation";
  error?: string;
  request?: AuthoringRequest;
  result?: { kind: "search" | "recommendations"; candidates: Candidate[] } | { kind: "create"; package: CreatedProblem } | { kind: "refine"; slug: string; title: string; revision: number; validation: ValidationReport };
};
type StoredJob = { id: string; mode: AuthoringRequest["mode"]; startedAt: number };
const WATCH_TIMEOUT_MS = 12 * 60 * 1_000;

export function useStudioJob(actorId?: string) {
  const storageKey = actorId ? `silogium:studio:job:${actorId}` : null;
  const [current, setCurrent] = useState<StoredJob | null>(null);
  const [job, setJob] = useState<JobResult | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [controlError, setControlError] = useState<string>();
  const controlController = useRef<AbortController | null>(null);
  const confirmationController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    generation.current += 1;
    controlController.current?.abort();
    controlController.current = null;
    setControlling(false);
    setControlError(undefined);
    confirmationController.current?.abort();
    confirmationController.current = null;
    setCurrent(null);
    setJob(null);
    setError(undefined);
    setConfirmationError(undefined);
    setMonitoring(false);
    setConfirming(false);
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as StoredJob | null;
      if (saved && typeof saved.id === "string" && /^[a-zA-Z0-9-]+$/.test(saved.id) && Number.isFinite(saved.startedAt) && ["search", "create", "import", "refine"].includes(saved.mode)) setCurrent(saved);
    } catch { /* Storage can be unavailable; current requests still work. */ }
  }, [storageKey]);

  useEffect(() => () => {
    generation.current += 1;
    controlController.current?.abort();
    controlController.current = null;
    confirmationController.current?.abort();
    confirmationController.current = null;
  }, [storageKey]);

  useEffect(() => {
    if (!current) return;
    let disposed = false;
    const epoch = generation.current;
    const active = () => !disposed && generation.current === epoch;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    let deadline = Date.now() + WATCH_TIMEOUT_MS;
    let inFlight = false;
    let stopped = false;
    setMonitoring(true);
    setError(undefined);

    async function poll() {
      if (!active() || document.hidden || inFlight || stopped) return;
      inFlight = true;
      const requestTimeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`/api/v1/jobs/${encodeURIComponent(current!.id)}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 404) throw new Error("Não encontramos este pedido na sua sessão. No modo local, pedidos antigos podem desaparecer ao reiniciar o servidor. Confira Minhas questões antes de enviar novamente.");
        const next = await readStudioResponse<JobResult>(response, "Não foi possível consultar o pedido");
        if (!["running", "completed", "failed", "needs_clarification", "needs_confirmation"].includes(next.status)) throw new Error("O servidor não informou o estado do pedido.");
        if (next.status === "needs_confirmation" && (next.request?.mode !== "create" || next.result?.kind !== "recommendations")) throw new Error("O servidor não forneceu o pedido analisado para confirmação. Consulte novamente antes de continuar.");
        if (!active()) return;
        setJob(next);
        if (next.status !== "needs_confirmation") setConfirmationError(undefined);
        if (next.status !== "running") {
          stopped = true;
          setMonitoring(false);
          return;
        }
        if (next.progress?.phase === "waiting") deadline = Date.now() + WATCH_TIMEOUT_MS;
        else if (Date.now() >= deadline) {
          stopped = true;
          setMonitoring(false);
          setError("O pedido está demorando mais que o esperado. Você pode consultar novamente ou abrir suas questões. O processamento no servidor não foi cancelado.");
          return;
        }
        timer = setTimeout(() => void poll(), next.progress?.phase === "waiting" ? 30_000 : 1_500);
      } catch (caught) {
        if (!active()) return;
        stopped = true;
        setMonitoring(false);
        setError(controller.signal.aborted ? "A consulta demorou a responder. Seu pedido continua salvo; consulte novamente para acompanhar." : studioError(caught));
      } finally {
        inFlight = false;
        clearTimeout(requestTimeout);
      }
    }
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) { deadline = Date.now() + WATCH_TIMEOUT_MS; void poll(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [current, retry]);

  useEffect(() => {
    if (!current || !monitoring) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - current.startedAt) / 1_000)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [current, monitoring]);

  function start(id: string, mode: StoredJob["mode"]) {
    generation.current += 1;
    controlController.current?.abort();
    controlController.current = null;
    setControlling(false);
    setControlError(undefined);
    confirmationController.current?.abort();
    confirmationController.current = null;
    const next = { id, mode, startedAt: Date.now() };
    setJob(null);
    setError(undefined);
    setConfirmationError(undefined);
    setConfirming(false);
    setCurrent(next);
    if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Best-effort recovery. */ }
  }

  function clear() {
    generation.current += 1;
    controlController.current?.abort();
    controlController.current = null;
    setControlling(false);
    setControlError(undefined);
    confirmationController.current?.abort();
    confirmationController.current = null;
    setCurrent(null);
    setJob(null);
    setMonitoring(false);
    setError(undefined);
    setConfirmationError(undefined);
    setConfirming(false);
    if (storageKey) try { localStorage.removeItem(storageKey); } catch { /* Best-effort recovery. */ }
  }

  async function confirm() {
    if (!current || job?.status !== "needs_confirmation" || confirmationController.current) return;
    const controller = new AbortController();
    const epoch = generation.current;
    confirmationController.current = controller;
    const active = () => generation.current === epoch && confirmationController.current === controller;
    setConfirming(true);
    setConfirmationError(undefined);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`/api/v1/jobs/${encodeURIComponent(current.id)}/confirm`, { method: "POST", signal: controller.signal });
      const accepted = await readStudioResponse<{ jobId: string }>(response, "Não foi possível confirmar a criação");
      if (!active()) return;
      if (accepted.jobId !== current.id) throw new Error("O servidor não confirmou o pedido original. Consulte novamente antes de continuar.");
      setJob((previous) => previous ? { ...previous, status: "running", result: undefined, error: undefined } : previous);
      setMonitoring(true);
      setRetry((value) => value + 1);
    } catch (caught) {
      if (!active()) return;
      setConfirmationError(controller.signal.aborted
        ? "A confirmação demorou a responder. Consulte este pedido novamente antes de tentar confirmar; ele pode já estar em processamento."
        : studioError(caught, "A confirmação perdeu a conexão. Consulte este pedido novamente; ele pode já estar em processamento."));
    } finally {
      clearTimeout(timeout);
      if (active()) {
        confirmationController.current = null;
        setConfirming(false);
      }
    }
  }

  async function control(action: "cancel" | "resume") {
    if (!current || controlController.current) return;
    const controller = new AbortController();
    controlController.current = controller;
    const epoch = generation.current;
    const active = () => generation.current === epoch && controlController.current === controller;
    setControlling(true); setControlError(undefined);
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/v1/jobs/${encodeURIComponent(current.id)}/${action}`, { method: "POST", signal: controller.signal });
      const result = await readStudioResponse<{ jobId: string }>(response, "Não foi possível alterar este pedido");
      if (!active()) return;
      if (result.jobId !== current.id) throw new Error("O servidor não confirmou o pedido original. Consulte novamente.");
      setRetry(value => value + 1);
    } catch (caught) {
      if (active()) setControlError(controller.signal.aborted ? "A resposta demorou. Consulte o pedido antes de repetir a ação." : studioError(caught));
    } finally {
      clearTimeout(timeout);
      if (active()) { controlController.current = null; setControlling(false); }
    }
  }

  return { current, job, monitoring, error, confirmationError, confirming, controlling, controlError, elapsedSeconds, start, clear, confirm, cancel: () => control("cancel"), resume: () => control("resume"), retry: () => setRetry((value) => value + 1) };
}
