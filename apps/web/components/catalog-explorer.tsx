"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Files, ListFilter, Plus, Search } from "lucide-react";
import { searchCatalog, type ProblemDefinition, type Runtime } from "@silogium/core";
import { ProblemCard } from "./problem-card";
import { SubmissionHistory } from "./submission-history";
import { useExecutionActivity } from "./execution-activity";
import { useCatalogFilters } from "./use-catalog-filters";
import { DEFAULT_CATALOG_FILTERS, type CatalogFilters } from "../lib/practice-preferences";
import { PersonalLibrary } from "./personal-library";
import { PracticeProgressStrip } from "./practice-progress";
import { usePracticeOverview } from "./use-practice-overview";
import { catalogProgressForProblem, summarizeCatalogProgress } from "../lib/catalog-progress";

export function CatalogExplorer({ problems, initialView = "catalog", actorId }: { problems: ProblemDefinition[]; initialView?: "catalog" | "activity"; actorId?: string }) {
  const [view, setView] = useState(initialView);
  const catalog = useCatalogFilters(actorId);
  const { query, runtime, difficulty, format, collection, progressFilter } = catalog.filters;
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const activity = useExecutionActivity();
  const practice = usePracticeOverview();
  const completeProgress = !practice.loading && !practice.error && practice.data?.historyComplete === true && Array.isArray(practice.data.catalogProgress);
  const progressReady = completeProgress || (!practice.loading && activity.state === "ready");
  const progress = useMemo(() => {
    const entries = completeProgress ? practice.data!.catalogProgress : summarizeCatalogProgress(activity.items);
    return new Map(problems.map((problem) => [problem.id, catalogProgressForProblem(problem, entries)]));
  }, [problems, completeProgress, practice.data, activity.items]);

  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setView(catalog.urlView), [catalog.urlView]);
  useEffect(() => {
    try {
      if (localStorage.getItem("silogium:catalog-density") === "comfortable") setDensity("comfortable");
    } catch { /* The catalog remains usable when browser storage is unavailable. */ }
  }, []);

  function changeDensity(value: typeof density) {
    setDensity(value);
    try { localStorage.setItem("silogium:catalog-density", value); } catch { /* Keep the preference for this visit. */ }
  }

  function changeView(value: typeof view) {
    setView(value);
    const url = new URL(window.location.href);
    if (value === "activity") url.searchParams.set("view", "activity");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  }
  const filtered = useMemo(() => {
    const searched = searchCatalog(problems, {
      query,
      runtime: runtime || undefined,
      difficulty: difficulty || undefined,
      format: format || (collection === "classic" || collection === "progressive" ? collection : undefined)
    });
    return searched.filter((problem) => (collection !== "native" || problem.origin === "native")
      && (collection !== "imported" || problem.origin === "licensed_import")
      && (!progressFilter || !progressReady || progress.get(problem.id)?.status === progressFilter));
  }, [problems, query, runtime, difficulty, format, collection, progressFilter, progress, progressReady]);

  const collections: Array<{ value: CatalogFilters["collection"]; label: string; count: number }> = [
    { value: "all", label: "Todas", count: problems.length },
    { value: "classic", label: "Clássicas", count: problems.filter((problem) => problem.format === "classic").length },
    { value: "progressive", label: "Progressivas", count: problems.filter((problem) => problem.format === "progressive").length },
    { value: "native", label: "Criadas no Silogium", count: problems.filter((problem) => problem.origin === "native").length },
    { value: "imported", label: "Importadas", count: problems.filter((problem) => problem.origin === "licensed_import").length }
  ];

  return <main className="practice-page">
    <header className="practice-header container">
      <div className="page-heading-row">
        <div><span className="eyebrow">Biblioteca</span><h1>Praticar</h1><p className="page-description">Questões prontas para executar no navegador ou no terminal.</p></div>
        <div className="catalog-count"><strong>{problems.length}</strong><span>questões disponíveis</span></div>
      </div>
      <div className="section-tabs" role="tablist" aria-label="Área de prática" onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? "catalog" : event.key === "End" ? "activity" : view === "catalog" ? "activity" : "catalog";
          changeView(next);
          document.getElementById(`practice-${next}-tab`)?.focus();
        }
      }}>
        <button type="button" id="practice-catalog-tab" role="tab" aria-selected={view === "catalog"} aria-controls="practice-panel" tabIndex={view === "catalog" ? 0 : -1} onClick={() => changeView("catalog")}><Files size={15} /> Catálogo</button>
        <button type="button" id="practice-activity-tab" role="tab" aria-selected={view === "activity"} aria-controls="practice-panel" tabIndex={view === "activity" ? 0 : -1} onClick={() => changeView("activity")}>Minha atividade</button>
      </div>
      {view === "catalog" && <>
        <div className="catalog-query-row">
          <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar questões</span><input value={query} maxLength={200} disabled={catalog.status === "loading"} onChange={(event) => catalog.update({ query: event.target.value })} placeholder="Buscar por tema, título ou tag" /></label>
          <Link className="button primary" href="/studio?mode=create"><Plus size={16} /> Criar questão</Link>
        </div>
        <div className="quick-filters" aria-label="Filtros rápidos">
          <ListFilter size={15} aria-hidden="true" />
          <select value={runtime} disabled={catalog.status === "loading"} onChange={(event) => catalog.update({ runtime: event.target.value as Runtime | "" })} aria-label="Filtrar linguagem"><option value="">Todas as linguagens</option><option value="typescript">TypeScript</option><option value="python">Python</option></select>
          <select value={difficulty} disabled={catalog.status === "loading"} onChange={(event) => catalog.update({ difficulty: event.target.value as ProblemDefinition["difficulty"] | "" })} aria-label="Filtrar dificuldade"><option value="">Toda dificuldade</option><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select>
          <select value={format} disabled={catalog.status === "loading"} onChange={(event) => catalog.update({ format: event.target.value as ProblemDefinition["format"] | "", collection: collection === "classic" || collection === "progressive" ? "all" : collection })} aria-label="Filtrar formato"><option value="">Todos os formatos</option><option value="classic">Clássica</option><option value="progressive">Progressiva</option></select>
          <select value={progressFilter} disabled={!progressReady || catalog.status === "loading"} onChange={(event) => catalog.update({ progressFilter: event.target.value as typeof progressFilter })} aria-label="Filtrar progresso"><option value="">Todo progresso</option><option value="in_progress">Em andamento</option><option value="solved">Resolvidas</option><option value="not_started">{completeProgress ? "Não iniciadas nesta versão" : "Sem atividade no recorte recente"}</option></select>
          {(query || runtime || difficulty || format || collection !== "all" || progressFilter) && <button type="button" className="button ghost clear-filters" onClick={() => catalog.update({ ...DEFAULT_CATALOG_FILTERS })}>Limpar filtros</button>}
        </div>
        <div className="catalog-display-options"><span className="filter-result-count" role="status">{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span><div className="density-switch" role="group" aria-label="Densidade do catálogo"><button type="button" aria-pressed={density === "compact"} onClick={() => changeDensity("compact")}>Compacta</button><button type="button" aria-pressed={density === "comfortable"} onClick={() => changeDensity("comfortable")}>Confortável</button></div></div>
        {catalog.status === "unavailable" && <p className="catalog-progress-note" role="status">O navegador não permitiu guardar os filtros. A URL mantém a busca atual e pode ser copiada.</p>}
        {catalog.status === "recovered" && <p className="catalog-progress-note" role="status">Filtros salvos inválidos foram ignorados. Sua atividade e suas questões não foram alteradas.</p>}
        {(practice.loading || (!progressReady && activity.state === "loading")) && <p className="catalog-progress-note" role="status">Carregando seu progresso…</p>}
        {completeProgress && <p className="catalog-progress-note">Progresso da versão atual, com base em todo o histórico {practice.data!.historyScope === "session" ? "disponível nesta sessão demo" : "da sua conta"}. “Resolvida” exige uma submissão aceita em todos os níveis; este indicador de prática não concede conquistas oficiais.</p>}
        {!completeProgress && !practice.loading && activity.state === "ready" && <p className="catalog-progress-note" role="status">O histórico completo está indisponível. Exibindo apenas as {activity.items.length} execuções recentes carregadas: questões resolvidas antes desse recorte podem não aparecer como resolvidas. <button type="button" className="button ghost" onClick={practice.refresh}>Tentar histórico completo novamente</button></p>}
        {!completeProgress && !practice.loading && activity.state === "unauthenticated" && <p className="catalog-progress-note"><Link href="/entrar">Entre na sua conta</Link> para acompanhar o progresso.</p>}
        {!completeProgress && !practice.loading && activity.state === "error" && <div className="catalog-progress-note" role="alert">Não foi possível carregar seu progresso. Filtros de progresso estão temporariamente desativados. <button type="button" className="button ghost" onClick={() => { practice.refresh(); activity.refresh(); }}>Tentar novamente</button></div>}
      </>}
    </header>

    {view === "catalog" && <PersonalLibrary problems={problems} />}
    {view === "catalog" && <div className="container"><PracticeProgressStrip /></div>}

    {view === "catalog" ? <div id="practice-panel" role="tabpanel" aria-labelledby="practice-catalog-tab" className="catalog-shell container">
      <aside className="catalog-sidebar" aria-label="Coleções de questões">{collections.map((item) => <button type="button" key={item.value} disabled={catalog.status === "loading"} aria-pressed={collection === item.value} onClick={() => catalog.update({ collection: item.value, format: "" })}><span>{item.label}</span><span>{item.count}</span></button>)}</aside>
      <section className={`problem-list density-${density}`} aria-label="Questões">
        <div className="problem-list-header"><span>Questão</span><span>Dificuldade</span><span>Formato</span><span>Runtime</span><span>Origem</span><span aria-hidden="true" /></div>
        {filtered.length ? filtered.map((problem) => <ProblemCard key={problem.id} problem={problem} progress={progressReady ? progress.get(problem.id) : undefined} progressScope={completeProgress ? "complete" : "recent"} />) : <div className="empty list-empty">Nenhuma questão corresponde aos filtros.</div>}
      </section>
    </div> : <section id="practice-panel" role="tabpanel" aria-labelledby="practice-activity-tab" className="activity-section container"><div className="activity-heading"><div><h2>Execuções e submissões</h2><p className="muted">O histórico do navegador e da CLI aparece na mesma linha do tempo.</p></div></div><SubmissionHistory activity={activity} problems={problems} /></section>}
  </main>;
}
