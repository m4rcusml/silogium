"use client";

import { useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { CheckCircle2, Copy, LoaderCircle, Play, Send, TerminalSquare, XCircle } from "lucide-react";
import type { ExecutionResult, ProblemDefinition, Runtime } from "@silogium/core";

export function ProblemWorkspace({ problem, accessKey }: { problem: ProblemDefinition; accessKey?: string }) {
  const [stage, setStage] = useState(1);
  const [runtime, setRuntime] = useState<Runtime>(problem.runtimes[0]!.language);
  const runtimeDefinition = useMemo(() => problem.runtimes.find((item) => item.language === runtime)!, [problem, runtime]);
  const [sources, setSources] = useState<Record<Runtime, string>>(() => ({
    typescript: problem.runtimes.find((item) => item.language === "typescript")?.starterCode ?? "",
    python: problem.runtimes.find((item) => item.language === "python")?.starterCode ?? ""
  }));
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState<"run" | "submission" | null>(null);
  const [mobileTab, setMobileTab] = useState<"question" | "code" | "result">("question");
  const [split, setSplit] = useState(42);
  const resizing = useRef(false);
  const workspace = useRef<HTMLElement>(null);

  async function execute(kind: "run" | "submission") {
    setRunning(kind); setResult(null);
    try {
      const response = await fetch("/api/v1/executions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, problemId: problem.id, problemVersion: problem.version, runtime, source: sources[runtime], maxStage: stage, accessKey })
      });
      setResult(await response.json());
      setMobileTab("result");
    } finally { setRunning(null); }
  }

  const selectedStage = problem.stages.find((item) => item.number === stage) ?? problem.stages[0]!;
  const cliCommand = `silogium pull ${problem.slug} --runtime ${runtime === "typescript" ? "ts" : "py"}${accessKey ? ` --access-key ${accessKey}` : ""}`;
  return <main ref={workspace} className="workspace" data-mobile-tab={mobileTab} style={{ gridTemplateColumns: `${split}% 6px 1fr` }} onPointerMove={(event) => {
    if (!resizing.current || !workspace.current) return;
    const bounds = workspace.current.getBoundingClientRect();
    setSplit(Math.min(68, Math.max(28, ((event.clientX - bounds.left) / bounds.width) * 100)));
  }} onPointerUp={() => { resizing.current = false; }} onPointerLeave={(pointerEvent) => { if (!pointerEvent.buttons) resizing.current = false; }}>
    <nav className="mobile-workspace-tabs" aria-label="Área da questão"><button className={mobileTab === "question" ? "active" : ""} onClick={() => setMobileTab("question")}>Questão</button><button className={mobileTab === "code" ? "active" : ""} onClick={() => setMobileTab("code")}>Código</button><button className={mobileTab === "result" ? "active" : ""} onClick={() => setMobileTab("result")}>Resultado</button></nav>
    <section className="statement-pane">
      <div className="badge-row"><span className="badge accent">{problem.difficulty === "hard" ? "Difícil" : problem.difficulty === "medium" ? "Média" : "Fácil"}</span><span className="badge">{problem.format === "progressive" ? `${problem.stages.length} níveis` : "Clássica"}</span></div>
      <p className="muted" style={{ fontSize: 13 }}>{problem.provenance.kind === "native" ? `Criada por @${problem.provenance.createdByHandle ?? "autor"}${problem.provenance.assistedByAi ? " com assistência da IA" : ""}.` : `Importada de ${problem.provenance.sourceName} sob ${problem.provenance.licenseSpdx}.`}</p>
      <div className="stage-tabs" style={{ marginTop: 20 }}>{problem.stages.map((item) => <button type="button" className={stage === item.number ? "active" : ""} onClick={() => setStage(item.number)} key={item.number}>Nível {item.number}</button>)}</div>
      <article className="markdown"><ReactMarkdown>{selectedStage.statementMd}</ReactMarkdown></article>
      <div className="card" style={{ marginTop: 28 }}><span className="eyebrow">Terminal</span><p className="muted" style={{ fontSize: 13, margin: "10px 0" }}>Baixe a mesma questão e execute os testes visíveis localmente.</p><button className="button" type="button" onClick={() => navigator.clipboard.writeText(cliCommand)}><TerminalSquare size={16} />{cliCommand}<Copy size={14} /></button></div>
    </section>
    <div className="workspace-resizer" role="separator" aria-label="Redimensionar painéis" aria-orientation="vertical" onPointerDown={(event) => { resizing.current = true; event.currentTarget.setPointerCapture(event.pointerId); }} />
    <section className="editor-pane">
      <header className="editor-toolbar">
        <select className="select" value={runtime} onChange={(event) => setRuntime(event.target.value as Runtime)}>{problem.runtimes.map((item) => <option key={item.language} value={item.language}>{item.language === "typescript" ? "TypeScript" : "Python"}</option>)}</select>
        <span className="muted" style={{ fontSize: 12 }}>{runtimeDefinition.version}</span><span className="spacer" />
        <button className="button" type="button" onClick={() => execute("run")} disabled={Boolean(running)}>{running === "run" ? <LoaderCircle size={15} /> : <Play size={15} />} Executar</button>
        <button className="button primary" type="button" onClick={() => execute("submission")} disabled={Boolean(running)}>{running === "submission" ? <LoaderCircle size={15} /> : <Send size={15} />} Submeter</button>
      </header>
      <div className="editor-canvas"><Editor height="100%" theme="vs-dark" language={runtime} value={sources[runtime]} onChange={(value) => setSources((current) => ({ ...current, [runtime]: value ?? "" }))} options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 16 }, scrollBeyondLastLine: false, automaticLayout: true }} /></div>
      <section className="results-pane">
        {!result && <p className="muted">Execute os testes para ver o resultado.</p>}
        {result && <><div className={result.verdict === "accepted" ? "success-text" : result.verdict === "system_error" ? "muted" : "danger-text"}>{result.verdict === "accepted" ? <CheckCircle2 size={18} /> : <XCircle size={18} />} <strong>{result.verdict}</strong> · {result.score}/{result.maxScore} pontos · {result.durationMs} ms</div>{result.message && <p className="muted">{result.message}</p>}<div>{result.cases.map((item) => <div className="case-result" key={item.id}><span>{item.passed ? "✓" : "×"} {item.name}</span><span className={item.passed ? "success-text" : "danger-text"}>{item.passed ? "passou" : item.message ?? "falhou"}</span></div>)}</div></>}
      </section>
    </section>
  </main>;
}
