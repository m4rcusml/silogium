"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import ReactMarkdown from "react-markdown";
import { SourceAttribution } from "./source-attribution";
import { FavoriteProblem } from "./personal-library";
import { ProblemCommunity } from "./problem-community";
import { SolutionSync } from "./solution-sync";
import { Check, ChevronLeft, Copy, Expand, LoaderCircle, Minimize2, Play, Send, TerminalSquare, X } from "lucide-react";
import { ExecutionResultSchema, JudgeCaseSchema, type ExecutionResult, type JudgeCase, type ProblemDefinition, type Runtime } from "@silogium/core";
import { SubmissionHistory } from "./submission-history";
import { useSolutionDraft } from "./use-solution-draft";
import { ExecutionFeedback } from "./execution-feedback";
import { CustomTestEditor } from "./custom-test-editor";
import { useWorkspacePreferences } from "./use-workspace-preferences";
import { configureEditorRuntime } from "./editor-runtime";
import { getSubmissionOutcome, type SubmissionContext } from "./submission-outcome";
import { SubmissionCompletionDialog, SubmissionNextStep } from "./submission-completion";

const difficultyLabel = { easy: "Fácil", medium: "Média", hard: "Difícil" } as const;
type RunOptions = { visibleCaseIds?: string[]; customCases?: JudgeCase[] };

export function ProblemWorkspace({ problem, visibleCases, accessKey, actorId, reopenSubmission, initialRuntime }: {
  problem: ProblemDefinition; visibleCases: JudgeCase[]; accessKey?: string; actorId: string; reopenSubmission?: string; initialRuntime?: Runtime;
}) {
  const [stage, setStage] = useState(problem.stages[0]!.number);
  const [runtime, setRuntime] = useState<Runtime>(initialRuntime && problem.runtimes.some((item) => item.language === initialRuntime) ? initialRuntime : problem.runtimes[0]!.language);
  const runtimeDefinition = problem.runtimes.find((item) => item.language === runtime)!;
  const { sources, updateSource, ready: draftReady, saveState } = useSolutionDraft(problem, actorId);
  const preferences = useWorkspacePreferences(actorId, problem.id, problem.version, runtime, visibleCases);
  const { customTests, split, resultHeight, fontSize, wordWrap } = preferences.values;
  const ready = draftReady && preferences.ready;
  const setCustomTests = (value: string) => preferences.update("customTests", value);
  const setSplit = (value: number | ((previous: number) => number)) => preferences.update("split", value);
  const setResultHeight = (value: number | ((previous: number) => number)) => preferences.update("resultHeight", value);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [resultContext, setResultContext] = useState("");
  const [executionContext, setExecutionContext] = useState<SubmissionContext>();
  const [completionOpen, setCompletionOpen] = useState(false);
  const celebratedRuntimes = useRef(new Set<Runtime>());
  const [running, setRunning] = useState<"run" | "submission" | null>(null);
  const inFlight = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [mobileTab, setMobileTab] = useState<"question" | "code" | "result">("question");
  const [statementTab, setStatementTab] = useState<"statement" | "history" | "community">("statement");
  const [resultTab, setResultTab] = useState<"result" | "custom">("result");
  const [customError, setCustomError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const terminalDialog = useRef<HTMLDialogElement>(null);
  const workspaceContent = useRef<HTMLDivElement>(null);
  const editorPane = useRef<HTMLElement>(null);
  const resultsPane = useRef<HTMLElement>(null);
  const codeEditor = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [previousSubmission, setPreviousSubmission] = useState<{ source: string; runtime: Runtime }>();
  const [reopenNotice, setReopenNotice] = useState("");
  const lastStage = Math.max(...problem.stages.map((item) => item.number));
  const cliCommand = `silogium pull ${problem.slug} --runtime ${runtime === "typescript" ? "ts" : "py"}${accessKey ? ` --access-key ${accessKey}` : ""}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!reopenSubmission) return;
    const controller = new AbortController();
    setReopenNotice("Consultando o código do envio anterior…");
    void fetch(`/api/v1/submissions/${encodeURIComponent(reopenSubmission)}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || payload.request?.problemId !== problem.id || payload.request?.problemVersion !== problem.version) throw new Error("Envio indisponível para esta questão e versão.");
      if (typeof payload.source !== "string" || !problem.runtimes.some((item) => item.language === payload.request.runtime)) throw new Error("O código deste envio não foi preservado no histórico.");
      setPreviousSubmission({ source: payload.source, runtime: payload.request.runtime }); setReopenNotice("Envio encontrado. Seu rascunho atual ainda não foi alterado.");
    }).catch((error) => { if (!controller.signal.aborted) setReopenNotice(error instanceof Error ? error.message : "Não foi possível abrir o envio."); });
    return () => controller.abort();
  }, [reopenSubmission, problem.id, problem.version]);

  useEffect(() => {
    if (focusMode) { document.body.classList.add("workspace-focus"); setMobileTab("code"); }
    else document.body.classList.remove("workspace-focus");
    return () => document.body.classList.remove("workspace-focus");
  }, [focusMode]);

  const execute = useCallback(async (kind: "run" | "submission", options?: RunOptions) => {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setRunning(kind);
    setResultTab("result");
    setMobileTab("result");
    setResult(null);
    setCompletionOpen(false);
    setCustomError(undefined);
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    const requestedStage = kind === "submission" || options?.customCases || options?.visibleCaseIds ? lastStage : stage;
    const context: SubmissionContext = { kind, runtime, maxStage: requestedStage, scope: kind === "submission" ? "official" : options?.customCases ? "custom" : options?.visibleCaseIds ? "selected" : "visible" };
    setExecutionContext(context);
    setResultContext(kind === "submission" ? "Submissão · avaliação completa" : options?.customCases ? "Testes próprios" : options?.visibleCaseIds ? "Caso visível selecionado" : problem.format === "classic" ? "Testes visíveis" : `Testes visíveis · até o nível ${requestedStage}`);
    try {
      const response = await fetch("/api/v1/executions", {
        method: "POST", headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ kind, problemId: problem.id, problemVersion: problem.version, runtime, source: sources[runtime], maxStage: requestedStage, accessKey, ...options })
      });
      const body = await response.json().catch(() => null);
      if (!body) throw new Error(`O servidor não retornou um resultado válido (HTTP ${response.status}). Tente novamente.`);
      const parsed = ExecutionResultSchema.safeParse(body);
      if (!parsed.success) throw new Error(body.error ?? "O servidor retornou um resultado inválido. Tente novamente.");
      if (!response.ok && parsed.data.verdict !== "system_error") throw new Error(`O servidor não confirmou a avaliação (HTTP ${response.status}). Consulte o Histórico antes de tentar novamente.`);
      if (mounted.current) {
        setResult(parsed.data);
        if (getSubmissionOutcome(problem, context, parsed.data).kind === "completed" && !celebratedRuntimes.current.has(runtime)) {
          celebratedRuntimes.current.add(runtime);
          setCompletionOpen(true);
        }
        setHistoryRevision((value) => value + 1);
        window.dispatchEvent(new Event("silogium:execution-saved"));
      }
    } catch (error) {
      if (mounted.current) setResult({
        id: crypto.randomUUID(), verdict: "system_error", score: 0, maxScore: 0, durationMs: 0, cases: [],
        message: controller.signal.aborted ? "O servidor demorou demais para responder. Seu código foi preservado. Consulte o Histórico antes de tentar novamente, pois a execução pode ter sido concluída." : error instanceof Error && !(error instanceof TypeError) ? error.message : "Não foi possível conectar ao servidor. Seu código foi preservado no editor."
      });
    } finally {
      window.clearTimeout(timeout);
      activeRequest.current = null;
      inFlight.current = false;
      if (mounted.current) setRunning(null);
    }
  }, [accessKey, lastStage, problem, ready, runtime, sources, stage]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      // Native dialogs own Escape and trap focus; workspace shortcuts must not submit behind them.
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") setFocusMode(false);
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter" || terminalDialog.current?.open || (event.target as HTMLElement)?.closest(".custom-test-editor")) return;
      event.preventDefault();
      void execute(event.shiftKey ? "submission" : "run");
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [execute]);

  function runCustomTests() {
    try {
      const raw: unknown = JSON.parse(customTests);
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) throw new Error("Informe uma lista JSON com 1 a 10 casos.");
      const tests = raw.map((item, index) => {
        const parsed = JudgeCaseSchema.safeParse(item);
        if (!parsed.success) throw new Error(`Caso ${index + 1}: revise ${parsed.error.issues[0]?.path.join(".") || "a estrutura do teste"}. Use o exemplo inicial como referência.`);
        return parsed.data;
      });
      if (tests.some((test) => test.kind !== problem.executionModel)) throw new Error(`Use casos do tipo ${problem.executionModel}.`);
      void execute("run", { customCases: tests });
    } catch (error) {
      setCustomError(error instanceof SyntaxError ? "JSON inválido. Revise vírgulas, aspas e colchetes." : error instanceof Error ? error.message : "Não foi possível ler os testes.");
    }
  }

  function copyToCustom(test: JudgeCase) {
    setCustomTests(JSON.stringify([{ ...test, id: `custom-${test.id}`, name: `${test.name} (cópia)` }], null, 2));
    setCustomError(undefined);
    setResultTab("custom");
    setMobileTab("result");
  }

  async function copyCliCommand() {
    try { await navigator.clipboard.writeText(cliCommand); setNotice("Comando copiado."); }
    catch { setNotice("Selecione o comando abaixo e copie manualmente."); }
  }

  function reviewResult() {
    setCompletionOpen(false);
    setResultTab("result");
    setMobileTab("result");
    requestAnimationFrame(() => resultsPane.current?.focus());
  }

  function continueEditing() {
    setCompletionOpen(false);
    setMobileTab("code");
    requestAnimationFrame(() => {
      if (codeEditor.current) codeEditor.current.focus();
      else editorPane.current?.focus();
    });
  }

  function advanceStage(nextStage: number) {
    setFocusMode(false);
    setStage(nextStage);
    setStatementTab("statement");
    setMobileTab("question");
  }

  const outcome = result && executionContext ? getSubmissionOutcome(problem, executionContext, result) : { kind: "none" as const };

  const selectedStage = problem.stages.find((item) => item.number === stage)!;
  const previousStages = problem.stages.filter((item) => item.number < stage);
  const statement = selectedStage.statementMd.replace(/^# [^\n]+\r?\n/, "").trim();
  const provenance = problem.provenance.kind === "native"
    ? `@${problem.provenance.createdByHandle ?? "autor"}${problem.provenance.assistedByAi ? " · com assistência da IA" : ""}`
    : `${problem.provenance.sourceName} · ${problem.provenance.licenseSpdx}`;

  return <main className="workspace" data-mobile-tab={mobileTab} data-focus={focusMode}>
    <header className="workspace-header">
      <Link href="/explorar" className="workspace-back" aria-label="Voltar para Praticar"><ChevronLeft size={16} /><span>Praticar</span></Link>
      <div className="workspace-title"><strong title={problem.title}>{problem.title}</strong><span>{difficultyLabel[problem.difficulty]} · versão {problem.version}</span></div>
      {problem.stages.length > 1 && <nav className="workspace-stages" aria-label="Níveis da questão">{problem.stages.map((item) => <button type="button" aria-label={`Nível ${item.number}, ${item.points} pontos`} aria-current={stage === item.number ? "step" : undefined} disabled={Boolean(running)} onClick={() => { setStage(item.number); setStatementTab("statement"); }} key={item.number}><span>N{item.number}</span><small>{item.points} pts</small></button>)}</nav>}
      <label className="runtime-picker"><span className="sr-only">Linguagem</span><select value={runtime} disabled={Boolean(running) || !ready} onChange={(event) => { setRuntime(event.target.value as Runtime); setResult(null); setCustomError(undefined); }}>{problem.runtimes.map((item) => <option key={item.language} value={item.language}>{item.language === "typescript" ? "TypeScript" : "Python"}</option>)}</select></label>
      <span className={`save-status ${saveState === "unavailable" ? "danger-text" : ""}`} role="status">{saveState === "loading" ? "Carregando…" : saveState === "unavailable" ? "Não salvo" : <><Check size={13} /> Salvo localmente</>}</span>
    </header>
    {reopenNotice && <div className="storage-warning" role="status">{reopenNotice}{previousSubmission && <button className="button" disabled={!ready || Boolean(running)} onClick={() => {
      if (window.confirm("Restaurar o código deste envio? O rascunho local desta linguagem será substituído.")) { setRuntime(previousSubmission.runtime); updateSource(previousSubmission.runtime, previousSubmission.source); setPreviousSubmission(undefined); setReopenNotice("Código restaurado no editor. Nenhuma submissão foi enviada."); setMobileTab("code"); }
    }}>Restaurar código do envio</button>}</div>}
    {saveState === "unavailable" && <div className="storage-warning" role="alert">O navegador não permitiu salvar o rascunho. Copie seu código antes de sair.</div>}
    {preferences.status === "unavailable" && <div className="storage-warning" role="alert">Não foi possível salvar preferências e testes próprios neste navegador. Copie seus testes antes de sair; o status do código é mostrado separadamente.</div>}
    {preferences.status === "recovered" && <div className="storage-warning" role="status">Algumas preferências salvas não puderam ser restauradas. Usamos os valores padrão apenas nos campos inválidos; seu código não foi alterado.</div>}
    <nav className="mobile-workspace-tabs" aria-label="Área da questão">{([['question', 'Questão'], ['code', 'Código'], ['result', 'Resultado']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mobileTab === value} onClick={() => setMobileTab(value)}>{label}</button>)}</nav>
    <div ref={workspaceContent} className="workspace-content" style={{ gridTemplateColumns: focusMode ? "1fr" : `minmax(0, ${split}fr) 6px minmax(0, ${100 - split}fr)` }}>
      <section className="statement-pane">
        <nav className="statement-tabs" aria-label="Informações da questão"><button type="button" aria-current={statementTab === "statement" ? "page" : undefined} onClick={() => setStatementTab("statement")}>Enunciado</button><button type="button" aria-current={statementTab === "history" ? "page" : undefined} onClick={() => setStatementTab("history")}>Histórico</button><button type="button" aria-current={statementTab === "community" ? "page" : undefined} onClick={() => setStatementTab("community")}>Dicas e comunidade</button></nav>
        {statementTab === "history" ? <div className="statement-history"><h2>Histórico desta questão</h2><SubmissionHistory key={historyRevision} problemId={problem.id} problemVersion={problem.version} /></div> : statementTab === "community" ? <ProblemCommunity problemId={problem.id} version={problem.version} published={problem.status === "published" && problem.visibility === "public"} /> : <>
          <div className="statement-meta"><span>{problem.format === "progressive" ? `Nível ${stage} de ${problem.stages.length}` : "Questão clássica"}</span><span>{selectedStage.points} pontos</span><span>{problem.limits.timeMs / 1_000}s · {problem.limits.memoryMiB} MiB</span></div>
          <div className="statement-heading"><h1>{problem.title}</h1></div>
          <p className="provenance">{problem.provenance.kind === "licensed_import" ? <a href={problem.provenance.sourceUrl} target="_blank" rel="noreferrer">{provenance} ↗</a> : provenance}</p>
          {stage > 1 && <aside className="cumulative-note"><strong>Novo neste nível</strong><span>Implemente os requisitos abaixo preservando os anteriores.</span></aside>}
          <article className="markdown"><ReactMarkdown>{statement}</ReactMarkdown></article>
          <SourceAttribution provenance={problem.provenance} />
          <FavoriteProblem problemId={problem.id} />
          <SolutionSync key={`${problem.version}:${runtime}`} problemId={problem.id} version={problem.version} runtime={runtime} accessKey={accessKey} disabled={Boolean(running) || !ready || !preferences.ready}
            snapshot={{ source: sources[runtime] ?? "", preferences: { ...preferences.values, fontSize: fontSize as 12 | 14 | 16 | 18 } }}
            onRestore={(snapshot) => { updateSource(runtime, snapshot.source); for (const field of ["fontSize", "wordWrap", "split", "resultHeight", "customTests"] as const) preferences.update(field, snapshot.preferences[field]); setMobileTab("code"); }} />
          {previousStages.length > 0 && <section className="previous-requirements"><h2>Requisitos acumulados</h2><p>Os níveis anteriores continuam fazendo parte da avaliação.</p>{previousStages.map((item) => <details key={item.number}><summary>Nível {item.number} · {item.points} pontos</summary><article className="markdown"><ReactMarkdown>{item.statementMd}</ReactMarkdown></article></details>)}</section>}
          <div className="statement-tags">{problem.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </>}
      </section>
      <div className="workspace-resizer" role="separator" tabIndex={0} aria-label="Redimensionar enunciado e editor" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={66} aria-valuenow={split}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit((value) => Math.max(30, Math.min(66, value + (event.key === "ArrowLeft" ? -2 : 2)))); } }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !workspaceContent.current) return;
          const bounds = workspaceContent.current.getBoundingClientRect();
          setSplit(Math.min(66, Math.max(30, ((event.clientX - bounds.left) / bounds.width) * 100)));
        }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} />
      <section ref={editorPane} className="editor-pane" aria-label="Editor de código" tabIndex={-1} style={{ gridTemplateRows: `42px minmax(0, ${100 - resultHeight}fr) 6px minmax(0, ${resultHeight}fr)` }}>
        <header className="editor-toolbar"><span>{runtime === "typescript" ? "solucao.ts" : "solucao.py"}</span><div className="editor-preferences"><label>Fonte <select aria-label="Tamanho da fonte" value={fontSize} disabled={!preferences.ready} onChange={(event) => preferences.update("fontSize", Number(event.target.value))}>{[12, 14, 16, 18].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" aria-pressed={wordWrap} disabled={!preferences.ready} onClick={() => preferences.update("wordWrap", !wordWrap)}>Quebrar linhas</button><button type="button" className="focus-toggle" aria-label={focusMode ? "Sair do modo foco" : "Modo foco"} onClick={() => setFocusMode(!focusMode)}>{focusMode ? <Minimize2 size={15} /> : <Expand size={15} />}</button></div></header>
        <div className="editor-canvas">{ready ? <Editor beforeMount={configureEditorRuntime} onMount={(instance) => { codeEditor.current = instance; }} height="100%" theme="vs-dark" language={runtime} path={`${actorId}/${problem.id}/${problem.version}/solution.${runtime === "typescript" ? "ts" : "py"}`} value={sources[runtime]} onChange={(value) => updateSource(runtime, value ?? "")} loading={<span className="muted">Carregando editor…</span>} options={{ minimap: { enabled: false }, fontSize, padding: { top: 16, bottom: 16 }, scrollBeyondLastLine: false, automaticLayout: true, renderLineHighlight: "line", wordWrap: wordWrap ? "on" : "off", readOnly: Boolean(running) }} /> : <span className="muted">Restaurando rascunho…</span>}</div>
        <div className="results-resizer" role="separator" tabIndex={0} aria-label="Redimensionar resultados" aria-orientation="horizontal" aria-valuemin={20} aria-valuemax={75} aria-valuenow={resultHeight}
          onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setResultHeight((value) => Math.max(20, Math.min(75, value + (event.key === "ArrowUp" ? 5 : -5)))); } }}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || !editorPane.current) return;
            const bounds = editorPane.current.getBoundingClientRect();
            setResultHeight(Math.max(20, Math.min(75, (bounds.bottom - event.clientY) / (bounds.height - 48) * 100)));
          }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} />
        <section ref={resultsPane} className="results-pane" aria-label="Resultado da avaliação" tabIndex={-1}>
          <nav className="results-header" aria-label="Testes e resultados"><button type="button" aria-pressed={resultTab === "result"} onClick={() => setResultTab("result")}>Resultado</button><button type="button" aria-pressed={resultTab === "custom"} onClick={() => setResultTab("custom")}>Testes próprios</button><span>{resultContext || `${runtimeDefinition.version}`}</span></nav>
          {resultTab === "custom" ? <CustomTestEditor value={customTests} onChange={setCustomTests} onRun={runCustomTests} busy={Boolean(running) || !ready} error={customError} /> : running ? <div className="results-empty" role="status"><LoaderCircle className="spin" size={18} /><span>{running === "submission" ? "Avaliando a solução completa…" : "Executando testes…"}</span></div> : result ? <ExecutionFeedback key={result.id} result={result} visibleCases={executionContext?.scope === "custom" ? [] : visibleCases} busy={Boolean(running)} acceptedLabel={executionContext?.kind === "run" ? "Testes aprovados" : "Aceita"} onRunCase={(id) => void execute("run", { visibleCaseIds: [id] })} onCopyCase={copyToCustom}>
            {executionContext && <SubmissionNextStep problem={problem} context={executionContext} outcome={outcome} onOpenCompletion={() => setCompletionOpen(true)} onSubmit={() => void execute("submission")} onAdvance={advanceStage} />}
          </ExecutionFeedback> : <div className="results-empty"><Play size={18} /><span>Execute os testes visíveis ou crie seus próprios casos.</span></div>}
        </section>
      </section>
    </div>
    <footer className="editor-actions">
      <button className="terminal-action" type="button" aria-label="Resolver no terminal" disabled={Boolean(running)} onClick={() => { setNotice(""); terminalDialog.current?.showModal(); }}><TerminalSquare size={16} /><span>Resolver no terminal</span></button>
      <span className="execution-scope">{problem.format === "classic" ? "Executar: testes visíveis · Submeter: avaliação completa" : `Executar: nível ${stage} · Submeter: todos`}</span>
      <button className="button" type="button" aria-keyshortcuts="Control+Enter Meta+Enter" title="Testes visíveis · Ctrl+Enter" onClick={() => void execute("run")} disabled={Boolean(running) || !ready}>{running === "run" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />} Executar</button>
      <button className="button primary" type="button" aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter" title="Avaliação completa · Ctrl+Shift+Enter" onClick={() => void execute("submission")} disabled={Boolean(running) || !ready}>{running === "submission" ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Submeter</button>
    </footer>
    <dialog className="terminal-dialog" ref={terminalDialog} aria-labelledby="terminal-title"><header><h2 id="terminal-title">Resolver pelo terminal</h2><button className="button ghost" type="button" aria-label="Fechar" onClick={() => terminalDialog.current?.close()}><X size={16} /></button></header><p>Baixe a questão e seus testes visíveis. Use o editor de sua preferência.</p><code>{cliCommand}</code><button className="button" type="button" onClick={copyCliCommand}><Copy size={14} /> Copiar comando</button><p role="status">{notice}</p><ol><li>Execute <code>silogium auth &lt;token&gt;</code> usando um token do <Link href="/perfil">seu perfil</Link>.</li><li>Execute o comando acima e abra o diretório baixado.</li><li>Rode <code>silogium test</code> e, quando terminar, <code>silogium submit</code>.</li></ol></dialog>
    {outcome.kind === "completed" && result && executionContext && <SubmissionCompletionDialog problem={problem} context={executionContext} result={result} open={completionOpen} onClose={() => setCompletionOpen(false)} onReview={reviewResult} onEdit={continueEditing} />}
  </main>;
}
