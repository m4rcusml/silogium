"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, FilePenLine, Files, LoaderCircle, Search, XCircle } from "lucide-react";
import { MyProblems } from "./my-problems";
import { problemOrigin, problemStatusLabel, readStudioResponse, studioError, visibilityLabel } from "./studio-request";
import { useStudioJob, type Candidate, type CreatedProblem } from "./use-studio-job";
import { CandidateDetails, CandidateOrigin, SimilarProblems } from "./similar-problems";
import { ValidationDetails } from "./validation-details";
import { StudioConversations } from "./studio-conversations";
import { StudioExamples, StudioGuide, StudioModePicker } from "./studio-orientation";

type RefinementDraft = { revision: number; phase: "draft" | "validating" | "validated"; problem: { title: string; slug: string } };

export function AssistantWorkbench({ providerLabel, initialSection = "compose", initialMode = "search", initialSlug, isAdmin = false, actorId }: { providerLabel: string; initialSection?: "compose" | "mine"; initialMode?: "search" | "create" | "refine"; initialSlug?: string; isAdmin?: boolean; actorId?: string }) {
  const router = useRouter();
  const [section, setSection] = useState(initialSection);
  const [mode, setMode] = useState<"search" | "create" | "refine">(initialMode);
  const [conversationId, setConversationId] = useState<string>();
  const [draft, setDraft] = useState<RefinementDraft>();
  const [draftError, setDraftError] = useState<string>();
  const [draftReload, setDraftReload] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [runtime, setRuntime] = useState<"typescript" | "python">("typescript");
  const [format, setFormat] = useState<"classic" | "progressive">("classic");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [licensesAccepted, setLicensesAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [importing, setImporting] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const [imported, setImported] = useState<CreatedProblem>();
  const request = useStudioJob(actorId);
  const loading = sending || request.monitoring || request.confirming || Boolean(importing);

  useEffect(() => setSection(initialSection), [initialSection]);
  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => { setConversationId(undefined); setDraft(undefined); }, [actorId]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setDraft(undefined);
    setDraftError(undefined);
    if (mode === "refine" && initialSlug) void fetch(`/api/v1/problems/${encodeURIComponent(initialSlug)}/editorial`, { cache: "no-store", signal: controller.signal })
      .then((response) => readStudioResponse<RefinementDraft>(response, "Não foi possível abrir o rascunho"))
      .then((value) => { if (active) setDraft(value); })
      .catch((caught) => { if (active) setDraftError(controller.signal.aborted ? "A consulta demorou a responder. Tente novamente." : studioError(caught)); })
      .finally(() => clearTimeout(timeout));
    else clearTimeout(timeout);
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [initialSlug, mode, actorId, draftReload]);
  useEffect(() => {
    if (request.job?.request?.conversationId) setConversationId(request.job.request.conversationId);
    if (request.job?.result?.kind === "refine") {
      const result = request.job.result;
      setDraft((previous) => previous?.problem.slug === result.slug ? { ...previous, revision: result.revision, phase: "draft" } : previous);
    }
  }, [request.job]);

  function changeSection(next: typeof section) {
    setSection(next);
    router.replace(next === "mine" ? "/studio?section=mine" : mode === "create" ? "/studio?mode=create" : "/studio", { scroll: false });
  }

  function changeMode(next: typeof mode) {
    setMode(next);
    router.replace(next === "refine" && initialSlug ? `/studio?mode=refine&slug=${encodeURIComponent(initialSlug)}` : next === "create" ? "/studio?mode=create" : "/studio", { scroll: false });
  }

  function startCreation() {
    setSection("compose");
    setPrompt("");
    setVisibility("private");
    setLicensesAccepted(false);
    setConversationId(undefined);
    setRequestError(undefined);
    setImportError(undefined);
    setImported(undefined);
    request.clear();
    changeMode("create");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || (mode === "refine" && (!draft || draft.phase === "validating"))) return;
    setSending(true);
    setRequestError(undefined);
    setImported(undefined);
    request.clear();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/v1/authoring", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...(mode === "refine" ? { mode, prompt: prompt.trim(), slug: draft?.problem.slug, expectedRevision: draft?.revision } : mode === "search" ? { mode, prompt: prompt.trim(), runtime } : { mode, prompt: prompt.trim(), runtime, format, difficulty, visibility, licensesAccepted }), conversationId })
      });
      const created = await readStudioResponse<{ jobId: string; conversationId?: string }>(response, "Não foi possível enviar o pedido");
      if (!created.jobId) throw new Error("O servidor não confirmou o pedido. Confira suas questões antes de reenviar.");
      request.start(created.jobId, mode);
      if (created.conversationId) setConversationId(created.conversationId);
    } catch (error) {
      setRequestError(controller.signal.aborted ? "O servidor não confirmou o pedido a tempo. Confira suas questões antes de reenviar para evitar duplicação." : studioError(error));
    } finally {
      clearTimeout(timeout);
      setSending(false);
    }
  }

  async function importCandidate(candidate: Candidate) {
    setImporting(candidate.id);
    setImported(undefined);
    setImportError(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const slug = new URL(candidate.url).pathname.split("/").filter(Boolean).at(-1);
      const response = await fetch("/api/v1/imports/exercism", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ slug, runtime: candidate.runtime, async: true, conversationId }) });
      const value = await readStudioResponse<CreatedProblem | { jobId: string; conversationId?: string }>(response, "Não foi possível importar a questão");
      if ("jobId" in value) { request.start(value.jobId, "import"); if (value.conversationId) setConversationId(value.conversationId); }
      else setImported(value);
    } catch (error) {
      setImportError(controller.signal.aborted ? "A importação está demorando mais que o esperado. Confira suas questões antes de tentar novamente." : studioError(error, "A importação perdeu a conexão. Confira suas questões antes de tentar novamente."));
    } finally {
      clearTimeout(timeout);
      setImporting(undefined);
    }
  }

  const result = request.job?.result;
  const analyzed = request.job?.request?.mode === "create" ? request.job.request : undefined;
  const edited = Boolean(analyzed && (mode !== "create" || prompt.trim() !== analyzed.prompt || runtime !== analyzed.runtime || format !== analyzed.format || difficulty !== analyzed.difficulty || visibility !== analyzed.visibility));
  const elapsed = `${Math.floor(request.elapsedSeconds / 60)}:${String(request.elapsedSeconds % 60).padStart(2, "0")}`;

  function adjustRequest() {
    if (!analyzed) return;
    setPrompt(analyzed.prompt);
    setRuntime(analyzed.runtime);
    setFormat(analyzed.format);
    setDifficulty(analyzed.difficulty);
    setVisibility(analyzed.visibility);
    setLicensesAccepted(false);
    changeMode("create");
    request.clear();
    document.getElementById("prompt")?.focus();
  }

  return <main className="studio-page">
    <aside className="studio-sidebar">
      <div className="studio-sidebar-heading"><span className="eyebrow">Autoria</span><strong>Studio</strong></div>
      <nav aria-label="Áreas do Studio">
        <button type="button" aria-current={section === "compose" ? "page" : undefined} onClick={() => changeSection("compose")}><FilePenLine size={16} /> Descobrir ou criar</button>
        <button type="button" aria-current={section === "mine" ? "page" : undefined} onClick={() => changeSection("mine")}><Files size={16} /> Minhas questões</button>
        {isAdmin && <Link href="/admin/revisao">Revisão editorial</Link>}
      </nav>
      <p>Aqui você encontra e prepara questões. Para escrever uma solução, abra a questão em Resolver.</p>
    </aside>

    <section className="studio-main">
      {section === "mine" ? <header className="studio-header"><div><span className="eyebrow">Studio · Suas criações</span><h1>Minhas questões</h1><p>Gerencie as questões que você criou ou importou.</p></div><button className="button primary" type="button" disabled={loading} onClick={startCreation}>Nova questão</button></header> : <header className="studio-header"><div><span className="eyebrow">Studio</span><h1>Descobrir ou criar</h1><p>Encontre seu próximo desafio ou peça uma questão sob medida. Depois, resolva no editor ou pelo terminal.</p></div><span className="provider-label">{providerLabel}</span></header>}

      {(sending || request.monitoring || request.error) && <div className="authoring-progress">
        <div className="authoring-progress-heading"><strong role="status">{sending ? "Analisando seu pedido…" : request.monitoring ? request.current?.mode === "search" ? "Pesquisando questões…" : request.current?.mode === "import" ? "Importando e validando…" : request.current?.mode === "refine" ? "Refinando o rascunho…" : "Processando seu pedido…" : "Acompanhamento pausado"}</strong>{request.monitoring && <span aria-label={`${request.elapsedSeconds} segundos desde o envio`}>{elapsed}</span>}</div>
        <p>{request.error ?? (sending ? "Verificando o pedido antes de continuar." : "Estamos consultando o andamento. Você pode navegar por outras questões e voltar ao Studio para acompanhar.")}</p>
        {request.error && <><div className="studio-inline-actions"><button className="button" type="button" onClick={request.retry}>Consultar novamente</button><button className="button" type="button" onClick={() => changeSection("mine")}>Conferir minhas questões</button><button className="button" type="button" onClick={request.clear}>Dispensar acompanhamento</button></div><p>Dispensar apenas fecha este aviso; não cancela nem reenvia o pedido.</p></>}
      </div>}

      {section === "mine" ? <div className="studio-library"><MyProblems refreshKey={result?.kind === "create" ? result.package.problem.id : imported?.problem.id} /></div> : <>
        <StudioGuide />
        <StudioModePicker mode={mode} canRefine={Boolean(initialSlug)} disabled={loading || Boolean(importing)} onChange={changeMode} />
        <form className="authoring-form" onSubmit={submit}>
          <div className="studio-form-intro"><h2>{mode === "search" ? "Encontre o que quer praticar" : mode === "create" ? "Descreva sua nova questão" : "Ajuste o enunciado e os testes"}</h2><p>{mode === "search" ? "Diga o assunto ou a habilidade. Você receberá sugestões com fonte e um caminho para resolver." : mode === "create" ? "A IA prepara o enunciado, o código inicial e os testes. Após a validação, você pode começar a resolver — não precisa publicar." : "Refinar muda a questão, não escreve sua solução. As alterações precisam ser revisadas e validadas antes de ficar disponíveis para resolução."}</p></div>
          {conversationId && <div className="studio-context"><p>Continuando uma conversa. A IA considera até quatro pedidos anteriores.</p><button type="button" className="button" disabled={loading} onClick={() => { setConversationId(undefined); request.clear(); setRequestError(undefined); setImportError(undefined); setImported(undefined); setLicensesAccepted(false); }}>Começar outro assunto</button></div>}
          {mode === "refine" && (draftError ? <div className="notice" role="alert"><p>Não foi possível abrir o rascunho: {draftError}</p><button type="button" className="button" onClick={() => setDraftReload((value) => value + 1)}>Tentar abrir rascunho novamente</button></div> : <p className="notice" role="status">{draft?.phase === "validating" ? <>A validação deste rascunho está em andamento. Aguarde a conclusão antes de pedir um refinamento. <Link href={`/studio?section=mine&edit=${encodeURIComponent(draft.problem.slug)}`}>Consultar rascunho no editor</Link></> : <>{draft ? `Refinando “${draft.problem.title}”, revisão ${draft.revision}.` : "Carregando rascunho…"} A IA recebe os materiais de autoria para manter testes e referência coerentes. A versão publicada permanece inalterada.</>}</p>)}
          <div className="field prompt-field"><label htmlFor="prompt">{mode === "refine" ? "O que deve mudar nesta questão?" : "Descreva tema, dificuldade ou estilo"}</label><textarea id="prompt" className="textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={5} maxLength={2000} required placeholder={mode === "refine" ? "Ex.: esclareça o desempate e acrescente um exemplo com entradas repetidas" : mode === "search" ? "Ex.: quero treinar mapas e ordenação em uma questão média" : "Ex.: uma questão sobre organizar horários de reuniões e encontrar conflitos"} />{!prompt && !loading && <StudioExamples mode={mode} onChoose={(value) => { setPrompt(value); document.getElementById("prompt")?.focus(); }} />}</div>
          <div className="authoring-options">
            {mode !== "refine" && <div className="field"><label htmlFor="runtime">Linguagem</label><select id="runtime" className="select" value={runtime} onChange={(event) => setRuntime(event.target.value as typeof runtime)}><option value="typescript">TypeScript</option><option value="python">Python</option></select></div>}
            {mode === "create" && <>
              <div className="field"><label htmlFor="format">Formato</label><select id="format" className="select" aria-describedby="format-help" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="classic">Clássica</option><option value="progressive">Progressiva</option></select><p id="format-help" className="studio-field-help">{format === "classic" ? "Um enunciado, uma solução. Todos os requisitos disponíveis desde o início." : "Um mesmo desafio em níveis. Cada etapa acrescenta requisitos à sua solução."}</p></div>
              <div className="field"><label htmlFor="difficulty">Dificuldade</label><select id="difficulty" className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></div>
              <div className="field"><label htmlFor="visibility">Visibilidade</label><select id="visibility" className="select" aria-describedby="visibility-help" value={visibility} onChange={(event) => { setVisibility(event.target.value as typeof visibility); setLicensesAccepted(false); }}><option value="private">Privada</option><option value="unlisted">Não listada</option><option value="public">Solicitar publicação</option></select><p id="visibility-help" className="studio-field-help">{visibility === "private" ? "Somente você e a administração têm acesso. Pode solicitar publicação depois." : visibility === "unlisted" ? "Fora do catálogo. O link autorizado permite acesso no site; o download pela CLI é exclusivo do proprietário." : "Vai para revisão após a validação. Só aparece no catálogo quando aprovada."}</p></div>
            </>}
          </div>
          {mode === "create" && visibility === "public" && <label className="license-consent"><input type="checkbox" checked={licensesAccepted} onChange={(event) => setLicensesAccepted(event.target.checked)} /><span>Aceito publicar o enunciado sob CC BY 4.0 e o starter e testes visíveis sob MIT, com crédito permanente.</span></label>}
          <div className="authoring-submit-row"><p>{mode === "refine" ? "Consome uma operação de IA. Não pesquisa a web. O resultado fica como rascunho para você revisar, salvar e validar no editor antes de publicar." : mode === "search" ? "Busca no catálogo, em fontes licenciadas e na web. Links externos abrem no site de origem." : "Primeiro verificamos questões parecidas. Se houver sugestões, você decide se quer criar outra. A criação não pesquisa a web e passa por testes automáticos."}</p><button className="button primary" disabled={loading || Boolean(importing) || prompt.trim().length < 5 || (mode === "refine" && (!draft || draft.phase === "validating")) || (mode === "create" && visibility === "public" && !licensesAccepted)}>{loading ? <LoaderCircle className="spin" size={16} /> : mode === "search" ? <Search size={16} /> : <FilePenLine size={16} />}{loading ? "Pedido em andamento" : mode === "refine" ? "Refinar com IA" : mode === "search" ? "Encontrar questões" : "Criar e validar"}</button></div>
        </form>

        <div className="authoring-results">
          {requestError && <div className="notice danger-text" role="alert">{requestError}</div>}
          {request.job?.error && <div className="notice danger-text" role="alert">{request.job.error}</div>}
          {request.job?.status === "needs_clarification" && !request.job.error && <div className="notice" role="status">O pedido precisa de mais detalhes. Especifique as operações, regras ou conceitos que deseja praticar.</div>}
          {importError && <div className="notice danger-text" role="alert">{importError}</div>}
          {importing && <div className="notice" role="status">Registrando a importação. Depois de receber o identificador, você pode sair desta página e acompanhar pelo histórico.</div>}
          {imported && <CreatedResult value={imported} actorId={actorId} isAdmin={isAdmin} />}
          {request.job?.status === "needs_confirmation" && result?.kind === "recommendations" && analyzed && <SimilarProblems candidates={result.candidates} snapshot={analyzed} edited={edited} busy={loading} error={request.confirmationError} onConfirm={() => void request.confirm()} onAdjust={adjustRequest} onRetry={request.retry} />}
          {result?.kind === "search" && <section className="search-results" aria-label="Questões encontradas">
            <h2>Escolha seu próximo desafio</h2><p>Resolver abre o editor do Silogium. Ver na fonte abre o site original. Importar e validar prepara uma cópia licenciada para resolver aqui.</p>
            <p role="status">{result.candidates.length ? `${result.candidates.length} ${result.candidates.length === 1 ? "questão encontrada" : "questões encontradas"}` : "Nenhuma questão encontrada. Tente outro tema ou uma descrição mais ampla."}</p>
            {result.candidates.map((candidate) => <article className="search-result" key={candidate.id}>
              <div><CandidateOrigin candidate={candidate} /><h2>{candidate.title}</h2><p>{candidate.summary}</p><CandidateDetails candidate={candidate} /></div>
              <div className="result-actions">
                {candidate.kind === "catalog" ? <Link className="button" href={candidate.url}>Resolver</Link> : <a href={candidate.url} target="_blank" rel="noreferrer">Ver na fonte <ArrowUpRight size={14} /></a>}
                {candidate.kind === "licensed_import" && candidate.importable && <button className="button" type="button" disabled={Boolean(importing) || loading} onClick={() => importCandidate(candidate)}>{importing === candidate.id ? "Importando…" : "Importar e validar"}</button>}
              </div>
            </article>)}
          </section>}
          {result?.kind === "create" && <CreatedResult value={result.package} actorId={actorId} isAdmin={isAdmin} />}
          {result?.kind === "refine" && <article className="created-result"><h2>{result.title}</h2><p role="status">Rascunho refinado e salvo na revisão {result.revision}. Revise as alterações; a versão anterior foi preservada.</p><ValidationDetails report={result.validation} /><Link className="button primary" href={`/studio?section=mine&edit=${encodeURIComponent(result.slug)}`}>Revisar e validar no editor</Link></article>}
        </div>
        <StudioConversations actorId={actorId} selectedId={conversationId} refreshKey={`${request.current?.id}:${request.job?.status}`} disabled={loading} onSelect={(id) => { setConversationId(id); request.clear(); setRequestError(undefined); setImportError(undefined); setImported(undefined); setLicensesAccepted(false); if (!id) setPrompt(""); }} onOpenJob={(turn) => request.start(turn.jobId, turn.mode)} />
      </>}
    </section>
  </main>;
}

function CreatedResult({ value, actorId, isAdmin }: { value: CreatedProblem; actorId?: string; isAdmin?: boolean }) {
  const { problem, validation } = value;
  const canRefine = isAdmin || (problem.provenance.kind === "native" ? problem.provenance.createdBy : problem.provenance.importedBy) === actorId;
  return <article className="created-result">
    <div className="created-result-status"><span>{validation.valid ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{problemStatusLabel[problem.status]}</span><span>{visibilityLabel[problem.visibility]}</span></div>
    <header className="created-result-heading"><h2>{problem.title}</h2><p>{problem.summary}</p><p className="result-origin">{problemOrigin(problem)}</p></header>
    <p role="status">{validation.valid ? problem.status === "pending_review" ? "Pronta para resolver. A publicação no catálogo aguarda revisão editorial." : "Validação concluída. Sua questão está pronta para resolver." : "A questão foi salva, mas ainda não passou na validação. Os detalhes abaixo mostram o que falhou."}</p>
    <ValidationDetails report={validation} />
    <div className="studio-result-next"><strong>{validation.valid ? "Próximo passo: escrever sua solução" : "Próximo passo: corrigir a questão"}</strong><p>{validation.valid ? "Abra o editor para programar e testar. Editar ou refinar altera a questão; não é necessário para começar a resolver." : "Abra o editor de autoria para revisar as falhas e validar novamente. A IA também pode ajudar no refinamento."}</p></div>
    <div className="studio-inline-actions">{validation.valid && <Link className="button primary" href={`/problemas/${problem.slug}${value.accessKey ? `?access_key=${encodeURIComponent(value.accessKey)}` : ""}`}>Resolver agora</Link>}{canRefine && <Link className="button" href={`/studio?section=mine&edit=${encodeURIComponent(problem.slug)}`}>Editar questão</Link>}<Link className="button" href="/studio?section=mine">Ver minhas questões</Link></div>
    {canRefine && <details className="studio-result-tools"><summary>Ajustar esta questão com IA</summary><p>Use quando quiser mudar as regras, os exemplos ou os testes da questão. Isso não resolve o exercício por você.</p><Link className="button" href={`/studio?mode=refine&slug=${encodeURIComponent(problem.slug)}`}>Refinar com IA</Link></details>}
  </article>;
}
