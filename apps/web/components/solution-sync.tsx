"use client";
import { useEffect, useState } from "react";
import type { Runtime, SolutionSnapshot } from "@silogium/core";

export function SolutionSync({ problemId, version, runtime, accessKey, snapshot, onRestore, disabled = false }: { problemId: string; version: number; runtime: Runtime; accessKey?: string; snapshot: SolutionSnapshot; onRestore(snapshot: SolutionSnapshot): void; disabled?: boolean }) {
  const [draft, setDraft] = useState<{ revision: number; snapshot: SolutionSnapshot; updatedAt: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("demo");
  useEffect(() => { setDraft(null); setLoaded(false); setNotice(""); }, [problemId, version, runtime]);
  const identity = { problemId, version, runtime, accessKey };
  async function load() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ problemId, version: String(version), runtime, ...(accessKey ? { accessKey } : {}) });
      const response = await fetch(`/api/v1/drafts?${params}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" }); const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDraft(body.draft); setMode(body.mode); setLoaded(true); setNotice(body.draft ? "Rascunho encontrado. Restaurar exige sua confirmação." : "Nenhum rascunho salvo no servidor nesta linguagem e versão.");
    } catch (error) { setNotice(error instanceof Error && error.name === "TimeoutError" ? "Tempo limite ao consultar. Tente novamente; o código local foi preservado." : error instanceof Error ? error.message : "Falha ao consultar rascunho."); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/drafts", { method: "PUT", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ ...identity, expectedRevision: draft?.revision ?? 0, snapshot }) }); const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDraft(body.draft); setMode(body.mode); setNotice("Rascunho e preferências sincronizados. Nenhuma submissão foi enviada.");
    } catch (error) { setNotice(error instanceof Error && error.name === "TimeoutError" ? "Tempo limite. O salvamento pode ter chegado ao servidor; consulte novamente antes de salvar." : error instanceof Error ? error.message : "Falha ao salvar rascunho."); setLoaded(false); } finally { setBusy(false); }
  }
  return <details className="solution-sync"><summary>Sincronizar rascunho entre dispositivos</summary><p className="muted">O salvamento local continua automático. A sincronização é explícita e inclui código, testes próprios e preferências desta versão e linguagem.</p><div className="personal-actions"><button type="button" className="button" disabled={busy || disabled} onClick={() => void load()}>Consultar rascunho salvo</button><button type="button" className="button" disabled={busy || disabled || !loaded} onClick={() => void save()}>Salvar no servidor</button>{draft && <button type="button" className="button" disabled={busy || disabled} onClick={() => { if (window.confirm("Substituir o código, os testes próprios e as preferências locais pelo rascunho salvo no servidor?")) { onRestore(draft.snapshot); setNotice("Rascunho restaurado. Nenhuma submissão foi enviada."); } }}>Restaurar rascunho salvo</button>}</div>{notice && <p role="status">{notice}</p>}{loaded && mode === "demo" && <p className="muted">Modo local: sincroniza apenas com esta sessão do servidor. Persistência entre reinícios requer Supabase.</p>}</details>;
}
