"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { EditorialReview, ValidationReport } from "@silogium/authoring";
import type { JudgeBundle, ProblemDefinition } from "@silogium/core";
import { problemOrigin, readStudioResponse, studioError } from "./studio-request";
type ReviewItem = { problem: ProblemDefinition; validation: ValidationReport; review: EditorialReview };
type ReviewDetail = ReviewItem & { bundle: JudgeBundle; previous: ProblemDefinition | null };

export function ReviewPanel() {
  const [reviews, setReviews] = useState<ReviewItem[]>();
  const [detail, setDetail] = useState<ReviewDetail>();
  const [reason, setReason] = useState("");
  const [inspected, setInspected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setError(undefined);
    const timeout = setTimeout(() => controller.abort(), 20_000);
    fetch("/api/v1/reviews", { cache: "no-store", signal: controller.signal }).then((response) => readStudioResponse<{ reviews: ReviewItem[] }>(response, "Não foi possível carregar as revisões")).then((body) => { if (!disposed) setReviews(body.reviews); }).catch((caught) => { if (!disposed) setError(studioError(caught)); }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [reload]);

  async function inspect(id: string) {
    setBusy(true); setError(undefined); setDetail(undefined); setInspected(false); setReason("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/v1/reviews/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      setDetail(await readStudioResponse<ReviewDetail>(response, "Não foi possível inspecionar esta versão"));
    } catch (caught) { setError(studioError(caught)); }
    finally { clearTimeout(timeout); setBusy(false); }
  }

  async function decide(decision: "approve" | "reject") {
    if (!detail || busy || !inspected) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`/api/v1/reviews/${encodeURIComponent(detail.review.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ decision, reason: reason.trim() }) });
      await readStudioResponse(response, "Não foi possível salvar a decisão editorial");
      setNotice(`Versão ${detail.problem.version} ${decision === "approve" ? "aprovada e publicada" : "rejeitada com orientação ao autor"}.`);
      setDetail(undefined); setInspected(false); setReason(""); setReload((value) => value + 1);
    } catch (caught) { setError(controller.signal.aborted ? "A resposta demorou. Atualize a fila antes de repetir a decisão." : studioError(caught)); }
    finally { clearTimeout(timeout); setBusy(false); }
  }

  return <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <div className="notice danger-text" role="alert"><p>{error}</p><button className="button" disabled={busy} onClick={() => { setDetail(undefined); setReload((value) => value + 1); }}>Atualizar fila</button></div>}
    {!reviews && !error && <div className="empty" role="status">Carregando fila…</div>}
    {reviews?.length === 0 && <div className="empty">Nenhuma questão aguarda revisão.</div>}
    {reviews?.map((item) => <article className="card" key={item.review.id} style={{ display: "grid", gap: 12 }}><div className="badge-row"><span className="badge accent">{item.problem.difficulty}</span><span className="badge">Versão {item.review.problemVersion}</span>{item.problem.tags.map((tag) => <span className="badge" key={tag}>{tag}</span>)}</div><h2>{item.problem.title}</h2><p className="muted">{item.problem.summary}</p><p className="muted">{problemOrigin(item.problem)}</p><p>{item.validation.checks.filter((check) => check.passed).length}/{item.validation.checks.length} verificações aprovadas</p><div><button className="button" disabled={busy} onClick={() => void inspect(item.review.id)}>Inspecionar versão {item.review.problemVersion}</button></div></article>)}
    {busy && <p role="status">Processando revisão…</p>}
    {detail && <section className="card" aria-label="Inspeção editorial" style={{ display: "grid", gap: 20, minWidth: 0 }}>
      <header><span className="eyebrow">Área restrita de revisão</span><h2>{detail.problem.title} · v{detail.problem.version}</h2><p className="muted">A decisão abaixo se refere somente a esta versão. Esta área administrativa contém gabaritos e testes ocultos.</p></header>
      <section style={{ display: "grid", gap: 12 }}><h3>Origem e licença</h3><p>{problemOrigin(detail.problem)}</p><details><summary>Inspecionar atribuição completa</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(detail.problem.provenance, null, 2)}</pre></details></section>
      {detail.previous && <details><summary>Comparar com a versão anterior ({detail.previous.version})</summary><div style={{ display: "grid", gap: 16, paddingTop: 16 }}><section><h3>Antes · {detail.previous.title}</h3><p>{detail.previous.summary}</p>{detail.previous.stages.map((stage) => <article className="markdown" key={stage.number}><h4>Nível {stage.number}</h4><ReactMarkdown>{stage.statementMd}</ReactMarkdown></article>)}</section><section><h3>Agora · {detail.problem.title}</h3><p>{detail.problem.summary}</p>{detail.problem.stages.map((stage) => <article className="markdown" key={stage.number}><h4>Nível {stage.number}</h4><ReactMarkdown>{stage.statementMd}</ReactMarkdown></article>)}</section></div></details>}
      {detail.problem.stages.map((stage) => <article className="markdown" key={stage.number}><h3>Nível {stage.number} · {stage.points} pontos</h3><ReactMarkdown>{stage.statementMd}</ReactMarkdown></article>)}
      {detail.problem.runtimes.map((runtime) => <section key={runtime.language} style={{ display: "grid", gap: 12 }}><h3>{runtime.language}</h3><details><summary>Starter</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{runtime.starterCode}</pre></details><details><summary>Solução de referência</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{detail.bundle.referenceSolutions[runtime.language] ?? "Referência ausente"}</pre></details></section>)}
      <details><summary>Testes visíveis ({detail.bundle.visibleCases.length})</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(detail.bundle.visibleCases, null, 2)}</pre></details>
      <details><summary>Testes ocultos ({detail.bundle.hiddenCases.length})</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(detail.bundle.hiddenCases, null, 2)}</pre></details>
      <section><h3>Validação automática</h3><ul className="validation-list">{detail.validation.checks.map((check, index) => <li key={index} className={check.passed ? "success-text" : "danger-text"}>{check.passed ? "✓" : "×"} {check.name}{check.message ? ` — ${check.message}` : ""}</li>)}</ul>{detail.validation.warnings?.map((warning) => <p className="muted" key={warning}>{warning}</p>)}</section>
      <div className="field"><label htmlFor="editorial-review-reason">Orientação ao autor (obrigatória para rejeitar)</label><textarea id="editorial-review-reason" className="textarea" value={reason} maxLength={2_000} disabled={busy} onChange={(event) => setReason(event.target.value)} /></div>
      <label className="license-consent"><input type="checkbox" checked={inspected} disabled={busy} onChange={(event) => setInspected(event.target.checked)} /><span>Revisei clareza, dificuldade, atribuição, originalidade e coerência entre enunciado, starter, referência e testes desta versão.</span></label>
      <div className="studio-inline-actions"><button className="button primary" disabled={busy || !inspected || !detail.validation.valid} onClick={() => void decide("approve")}>Aprovar versão {detail.problem.version}</button><button className="button" disabled={busy || !inspected || reason.trim().length < 5} onClick={() => void decide("reject")}>Rejeitar e orientar</button></div>
    </section>}
  </div>;
}
