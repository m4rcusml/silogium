"use client";

import { useEffect, useState } from "react";
import type { OperationalAvailability } from "@silogium/core";
import { readStudioResponse, studioError } from "./studio-request";
import { brasiliaResetLabel } from "../lib/studio-access";

export function OperationalCapacityPanel() {
  const [availability, setAvailability] = useState<OperationalAvailability>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    fetch("/api/v1/admin/capacity", { cache: "no-store", signal: controller.signal })
      .then(response => readStudioResponse<OperationalAvailability>(response, "Não foi possível conferir a capacidade"))
      .then(value => { if (active) { setAvailability(value); setError(undefined); } })
      .catch(caught => { if (active) setError(studioError(caught)); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [revision]);

  async function change(service: "groq" | "modal", paused: boolean) {
    if (busy) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/v1/admin/capacity", { method: "PATCH", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ service, paused }) });
      setAvailability(await readStudioResponse<OperationalAvailability>(response, "Não foi possível atualizar a pausa"));
      setNotice(paused ? "Pausa administrativa ativada. Pedidos mantêm as etapas salvas para retomada." : "Pausa administrativa removida. Cotas, créditos e verificações de segurança continuam obrigatórios.");
    } catch (caught) { setError(controller.signal.aborted ? "A resposta demorou. Atualize antes de repetir a alteração." : studioError(caught)); }
    finally { clearTimeout(timeout); setBusy(false); }
  }

  return <section className="beta-panel card" aria-labelledby="capacity-heading"><header><span className="eyebrow">Operação do beta</span><h2 id="capacity-heading">Disponibilidade dos serviços</h2><p className="muted">Pause cada serviço separadamente. O catálogo não é interrompido. Remover uma pausa não compra créditos nem ignora os limites gratuitos.</p></header>
    {error && <p className="notice danger-text" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <div className="capacity-services">{(["groq", "modal"] as const).map(service => { const value = availability?.[service]; return <article key={service}><div><h3>{service === "groq" ? "IA · Groq" : "Execuções · Modal"}</h3><strong>{value ? value.available ? "Disponível" : "Indisponível no momento" : "Conferindo disponibilidade…"}</strong><p className="muted">{value?.reason ?? (value?.available ? "Capacidade liberada para participantes aprovados, dentro das cotas." : "Aguarde a consulta antes de alterar.")}</p>{value?.retryAt && <p className="muted">Nova tentativa a partir de {brasiliaResetLabel(value.retryAt)}.</p>}</div><div className="studio-inline-actions"><button className="button" type="button" disabled={busy || !value} onClick={() => void change(service, true)}>Pausar {service === "groq" ? "IA" : "execuções"}</button><button className="button" type="button" disabled={busy || !value} onClick={() => void change(service, false)}>Remover pausa de {service === "groq" ? "IA" : "execuções"}</button></div></article>; })}</div>
    <div><button className="button" type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Atualizar capacidade</button></div>
  </section>;
}
