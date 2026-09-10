"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EditableProblem, EditorialView } from "@silogium/authoring";
import { readStudioResponse, studioError } from "./studio-request";

export function ProblemAuthoringEditor({ slug, onClose, onSaved }: { slug: string; onClose: () => void; onSaved: () => void }) {
  const [view, setView] = useState<EditorialView>();
  const [content, setContent] = useState<EditableProblem>();
  const [visible, setVisible] = useState("");
  const [hidden, setHidden] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [revealConsent, setRevealConsent] = useState(false);
  const [licenseConsent, setLicenseConsent] = useState(false);
  const endpoint = `/api/v1/problems/${encodeURIComponent(slug)}/editorial`;

  function apply(next: EditorialView) {
    setView(next);
    const { title, summary, difficulty, tags, stages, runtimes, examples, limits } = next.problem;
    setContent({ title, summary, difficulty, tags, stages, runtimes, examples, limits });
    setVisible(JSON.stringify(next.visibleCases, null, 2));
    setHidden(next.spoilers ? JSON.stringify(next.spoilers.hiddenCases, null, 2) : "");
    setReferences(next.spoilers?.referenceSolutions ?? {});
    setDirty(false); setLicenseConsent(false); setRevealConsent(false);
  }

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setView(undefined); setContent(undefined); setError(undefined); setBusy("Carregando rascunho…");
    const timeout = setTimeout(() => controller.abort(), 20_000);
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then((response) => readStudioResponse<EditorialView>(response, "Não foi possível abrir o rascunho"))
      .then((next) => { if (!disposed) apply(next); })
      .catch((caught) => { if (!disposed) setError(studioError(caught)); })
      .finally(() => { clearTimeout(timeout); if (!disposed) setBusy(undefined); });
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [endpoint]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function change(patch: Partial<EditableProblem>) { setContent((previous) => ({ ...previous!, ...patch })); setDirty(true); setNotice(undefined); }
  async function perform(action: "load" | "reveal" | "save" | "validate" | "publication") {
    if (busy || (action !== "load" && !view)) return;
    if (action === "load" && dirty && !window.confirm("Descartar apenas as alterações ainda não salvas deste formulário?")) return;
    setBusy(action === "validate" ? "Validando referência, starter e testes…" : "Processando…"); setError(undefined); setNotice(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), action === "validate" ? 120_000 : 30_000);
    try {
      const body = action === "save" ? { expectedRevision: view!.revision, content, visibleCases: JSON.parse(visible), ...(view!.spoilers ? { spoilers: { hiddenCases: JSON.parse(hidden), referenceSolutions: references } } : {}) }
        : { action, expectedRevision: view?.revision, licensesAccepted: licenseConsent };
      const response = await fetch(`${endpoint}${action === "reveal" ? "?revealSpoilers=true" : ""}`, {
        method: action === "load" || action === "reveal" ? "GET" : action === "save" ? "PATCH" : "POST",
        cache: "no-store", signal: controller.signal,
        ...(action === "load" || action === "reveal" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      });
      const next = await readStudioResponse<EditorialView>(response, "Não foi possível concluir a edição");
      apply(next);
      setNotice(action === "save" ? "Rascunho salvo. Valide antes de resolver ou publicar a nova versão." : action === "validate" ? next.validation.valid ? "Nova versão validada e pronta para resolver. A versão pública anterior não foi alterada." : "A validação encontrou problemas. Seu rascunho foi preservado para correção." : action === "publication" ? "Versão enviada para revisão editorial." : undefined);
      onSaved();
    } catch (caught) { setError(controller.signal.aborted ? "A resposta demorou. Consulte o rascunho antes de repetir: a operação pode continuar no servidor." : caught instanceof SyntaxError ? "Revise o JSON dos testes antes de salvar." : studioError(caught)); }
    finally { clearTimeout(timeout); setBusy(undefined); }
  }

  const submitted = view?.reviews.some((review) => review.problemVersion === view.problem.version && (review.status === "pending" || review.status === "approved"));
  return <section className="card" aria-label="Editar questão" style={{ display: "grid", gap: 20, minWidth: 0, marginBottom: 24 }}>
    <header className="page-heading-row" style={{ flexWrap: "wrap", alignItems: "flex-start" }}><div style={{ flex: "1 1 220px", minWidth: 0 }}><span className="eyebrow">Edição editorial</span><h2>{view?.problem.title ?? "Abrindo questão"}</h2><p className="muted">Um rascunho não altera as versões já resolvidas ou publicadas.</p></div><button className="button" disabled={Boolean(busy)} onClick={() => { if (!dirty || window.confirm("Sair sem salvar as alterações deste formulário?")) onClose(); }}>Fechar edição</button></header>
    {busy && <p role="status">{busy}</p>}
    {error && <div className="notice danger-text" role="alert"><p>{error}</p><button className="button" disabled={Boolean(busy)} onClick={() => void perform("load")}>Consultar rascunho</button></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {view && content && <>
      <p className="muted">Versão de trabalho {view.problem.version} · revisão {view.revision} · {dirty ? "Alterações não salvas" : view.phase === "validating" ? "Validação em andamento" : view.phase === "validated" ? "Validada" : "Rascunho"}</p>
      {!dirty && view.phase !== "validating" && <div><Link className="button" href={`/studio?mode=refine&slug=${encodeURIComponent(slug)}`}>Refinar com IA</Link></div>}
      <fieldset disabled={Boolean(busy) || view.phase === "validating"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 16 }}>
        <div className="field"><label htmlFor="editorial-title">Título</label><input id="editorial-title" className="input" value={content.title} maxLength={180} onChange={(event) => change({ title: event.target.value })} /></div>
        <div className="field"><label htmlFor="editorial-summary">Resumo</label><textarea id="editorial-summary" className="textarea" value={content.summary} maxLength={2_000} onChange={(event) => change({ summary: event.target.value })} /></div>
        <div className="authoring-options"><div className="field"><label htmlFor="editorial-difficulty">Dificuldade editorial</label><select id="editorial-difficulty" className="select" value={content.difficulty} onChange={(event) => change({ difficulty: event.target.value as EditableProblem["difficulty"] })}><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></div><div className="field"><label htmlFor="editorial-tags">Tags separadas por vírgula</label><input id="editorial-tags" className="input" value={content.tags.join(", ")} onChange={(event) => change({ tags: event.target.value.split(",").map((tag) => tag.trim()) })} /></div></div>
        {content.stages.map((stage, index) => <div className="field" key={stage.number}><label htmlFor={`editorial-stage-${stage.number}`}>Enunciado do nível {stage.number} · Markdown</label><textarea id={`editorial-stage-${stage.number}`} className="textarea" style={{ minHeight: 180 }} value={stage.statementMd} onChange={(event) => change({ stages: content.stages.map((item, position) => position === index ? { ...item, statementMd: event.target.value } : item) })} /></div>)}
        {content.runtimes.map((runtime, index) => <div className="field" key={runtime.language}><label htmlFor={`editorial-starter-${runtime.language}`}>Starter · {runtime.language}</label><textarea id={`editorial-starter-${runtime.language}`} className="textarea" style={{ minHeight: 200, fontFamily: "monospace" }} spellCheck={false} maxLength={200_000} value={runtime.starterCode} onChange={(event) => change({ runtimes: content.runtimes.map((item, position) => position === index ? { ...item, starterCode: event.target.value } : item) })} /></div>)}
        <div className="field"><label htmlFor="editorial-visible-tests">Testes visíveis · JSON</label><textarea id="editorial-visible-tests" className="textarea" style={{ minHeight: 200, fontFamily: "monospace" }} spellCheck={false} value={visible} onChange={(event) => { setVisible(event.target.value); setDirty(true); }} /></div>
      </fieldset>
      {!view.spoilers ? <div className="notice" style={{ display: "grid", gap: 12 }}><p>O modo padrão não revela a resposta. Abrir o material avançado mostra soluções de referência e testes ocultos; você conhecerá o gabarito desta questão. O acesso fica registrado para regras futuras de conquistas.</p><label className="license-consent"><input type="checkbox" checked={revealConsent} disabled={Boolean(busy) || dirty} onChange={(event) => setRevealConsent(event.target.checked)} /><span>Entendo o spoiler e quero editar os materiais privados de autoria.</span></label><button className="button" disabled={!revealConsent || dirty || Boolean(busy)} onClick={() => void perform("reveal")}>Revelar material de autoria</button>{dirty && <p className="muted">Salve as alterações antes de abrir o modo avançado.</p>}</div> : <fieldset disabled={Boolean(busy)} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, minWidth: 0, display: "grid", gap: 16 }}><legend>Material de autoria revelado</legend><div className="field"><label htmlFor="editorial-hidden-tests">Testes ocultos · JSON</label><textarea id="editorial-hidden-tests" className="textarea" spellCheck={false} value={hidden} onChange={(event) => { setHidden(event.target.value); setDirty(true); }} /></div>{content.runtimes.map((runtime) => <div className="field" key={runtime.language}><label htmlFor={`editorial-reference-${runtime.language}`}>Solução de referência · {runtime.language}</label><textarea id={`editorial-reference-${runtime.language}`} className="textarea" style={{ minHeight: 200, fontFamily: "monospace" }} spellCheck={false} maxLength={200_000} value={references[runtime.language] ?? ""} onChange={(event) => { setReferences((previous) => ({ ...previous, [runtime.language]: event.target.value })); setDirty(true); }} /></div>)}</fieldset>}
      <div className="studio-inline-actions"><button className="button primary" disabled={!dirty || Boolean(busy) || view.phase === "validating"} onClick={() => void perform("save")}>Salvar rascunho</button><button className="button" disabled={dirty || Boolean(busy) || view.phase === "validated"} onClick={() => void perform("validate")}>Validar versão</button><button className="button" disabled={Boolean(busy)} onClick={() => void perform("load")}>Consultar rascunho</button>{view.phase === "validated" && <Link className="button" href={`/problemas/${view.problem.slug}?version=${view.problem.version}`}>Resolver esta versão</Link>}</div>
      {view.validation.checks.length > 0 && <details><summary>Verificações da versão ({view.validation.checks.filter((item) => item.passed).length}/{view.validation.checks.length})</summary><ul className="validation-list">{view.validation.checks.map((check, index) => <li key={index} className={check.passed ? "success-text" : "danger-text"}>{check.passed ? "✓" : "×"} {check.name}{check.message ? ` — ${check.message}` : ""}</li>)}</ul>{view.validation.warnings?.map((warning) => <p className="muted" key={warning}>{warning}</p>)}</details>}
      {view.phase === "validated" && !submitted && <div className="notice" style={{ display: "grid", gap: 12 }}><label className="license-consent"><input type="checkbox" checked={licenseConsent} disabled={dirty || Boolean(busy)} onChange={(event) => setLicenseConsent(event.target.checked)} /><span>{view.problem.provenance.kind === "native" ? "Confirmo a publicação desta versão sob CC BY 4.0 (enunciado) e MIT (starter/testes visíveis), com crédito permanente ao autor." : `Confirmo a atribuição à fonte e a manutenção da licença original ${view.problem.provenance.licenseSpdx}.`}</span></label><button className="button" disabled={!licenseConsent || dirty || Boolean(busy)} onClick={() => void perform("publication")}>Enviar versão para revisão</button></div>}
      {view.reviews.length > 0 && <section style={{ display: "grid", gap: 12 }}><h3>Retorno editorial</h3>{view.reviews.map((review) => <article className="notice" key={review.id}><strong>Versão {review.problemVersion} · {review.status === "pending" ? "Aguardando revisão" : review.status === "approved" ? "Aprovada" : "Rejeitada"}</strong>{review.reason && <p>{review.reason}</p>}<p className="muted">{new Date(review.reviewedAt ?? review.createdAt).toLocaleDateString("pt-BR")}</p></article>)}</section>}
    </>}
  </section>;
}
