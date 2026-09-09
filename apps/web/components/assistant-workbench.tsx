"use client";

import { useState } from "react";
import { ArrowUpRight, Bot, CheckCircle2, LoaderCircle, Search, Sparkles } from "lucide-react";

type Candidate = { id: string; kind: string; title: string; summary: string; url: string; sourceName: string; licenseSpdx?: string; importable: boolean; runtime: "typescript" | "python" };
type JobResult = {
  status: string;
  error?: string;
  result?:
    | { kind: "search"; candidates: Candidate[] }
    | { kind: "create"; package: { problem: { id: string; slug: string; title: string; summary: string; status: string; visibility: string }; accessKey?: string; validation: { valid: boolean; checks: Array<{ name: string; passed: boolean; message?: string }> } } };
};

export function AssistantWorkbench() {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [prompt, setPrompt] = useState("");
  const [runtime, setRuntime] = useState<"typescript" | "python">("typescript");
  const [format, setFormat] = useState<"classic" | "progressive">("classic");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [licensesAccepted, setLicensesAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<JobResult | null>(null);
  const [importing, setImporting] = useState<string>();
  const [imported, setImported] = useState<{ slug: string; title: string }>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setJob(null);
    try {
      const response = await fetch("/api/v1/authoring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "search"
          ? { mode, prompt, runtime }
          : { mode, prompt, runtime, format, difficulty, visibility, licensesAccepted })
      });
      const created = await response.json();
      if (!response.ok) throw new Error(created.error ?? "Não foi possível processar o pedido.");
      const jobResponse = await fetch(`/api/v1/jobs/${created.jobId}`);
      setJob(await jobResponse.json());
    } catch (error) {
      setJob({ status: "failed", error: error instanceof Error ? error.message : "Falha inesperada." });
    } finally {
      setLoading(false);
    }
  }

  async function importCandidate(candidate: Candidate) {
    setImporting(candidate.id); setImported(undefined);
    try {
      const slug = new URL(candidate.url).pathname.split("/").filter(Boolean).at(-1);
      const response = await fetch("/api/v1/imports/exercism", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, runtime: candidate.runtime }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível importar.");
      setImported({ slug: body.problem.slug, title: body.problem.title });
    } catch (error) {
      setJob({ status: "failed", error: error instanceof Error ? error.message : "Falha inesperada." });
    } finally { setImporting(undefined); }
  }

  return <div className="assistant-shell">
    <aside className="assistant-aside">
      <span className="eyebrow">Modo</span>
      <div className="mode-switch" style={{ marginTop: 12 }}>
        <button type="button" className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={14} /> Pesquisar</button>
        <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}><Sparkles size={14} /> Criar</button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>{mode === "search" ? "Busca primeiro no Silogium, depois em fontes licenciadas. Outros resultados permanecem links externos." : "Cria uma questão original sem pesquisar a web. Ela nasce como rascunho validado."}</p>
    </aside>
    <main className="assistant-main">
      <span className="eyebrow">Assistente</span>
      <h1 style={{ fontSize: 44 }}>{mode === "search" ? "O que você quer praticar?" : "Que questão devemos criar?"}</h1>
      <form className="form-stack" onSubmit={submit}>
        <div className="field"><label htmlFor="prompt">Descreva tema, dificuldade ou estilo</label><textarea id="prompt" className="textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={5} required placeholder="Ex.: uma questão média de grafos que use busca em largura..." /></div>
        <div className="filters" style={{ margin: 0 }}>
          <div className="field"><label htmlFor="runtime">Linguagem</label><select id="runtime" className="select" value={runtime} onChange={(event) => setRuntime(event.target.value as typeof runtime)}><option value="typescript">TypeScript</option><option value="python">Python</option></select></div>
          {mode === "create" && <><div className="field"><label htmlFor="format">Formato</label><select id="format" className="select" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="classic">Clássica</option><option value="progressive">Progressiva</option></select></div><div className="field"><label htmlFor="difficulty">Dificuldade</label><select id="difficulty" className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></div><div className="field"><label htmlFor="visibility">Visibilidade</label><select id="visibility" className="select" value={visibility} onChange={(event) => { setVisibility(event.target.value as typeof visibility); setLicensesAccepted(false); }}><option value="private">Privada</option><option value="unlisted">Não listada</option><option value="public">Solicitar publicação</option></select></div></>}
        </div>
        {mode === "create" && visibility === "public" && <label className="license-consent"><input type="checkbox" checked={licensesAccepted} onChange={(event) => setLicensesAccepted(event.target.checked)} /> Aceito publicar o enunciado sob CC BY 4.0 e o starter e testes visíveis sob MIT, com crédito permanente.</label>}
        <button className="button primary" disabled={loading || prompt.length < 5 || (mode === "create" && visibility === "public" && !licensesAccepted)}>{loading ? <LoaderCircle size={16} /> : <Bot size={16} />}{loading ? "Processando..." : mode === "search" ? "Encontrar questões" : "Criar e validar"}</button>
      </form>
      {job?.error && <div className="card danger-text" style={{ marginTop: 24 }}>{job.error}</div>}
      {imported && <div className="card" style={{ marginTop: 20 }}>“{imported.title}” foi importada, validada e mantida privada. <a className="source-link" href={`/problemas/${imported.slug}`}>Resolver agora</a></div>}
      {job?.result?.kind === "search" && <div className="result-list">{job.result.candidates.map((candidate) => <article className="card" key={candidate.id}><div className="badge-row"><span className="badge accent">{candidate.kind === "catalog" ? "Silogium" : candidate.kind === "licensed_import" ? "Importável" : "Link externo"}</span>{candidate.licenseSpdx && <span className="badge">{candidate.licenseSpdx}</span>}</div><h3 style={{ marginTop: 14 }}>{candidate.title}</h3><p className="muted">{candidate.summary}</p><div className="hero-actions"><a className="source-link" href={candidate.url} target={candidate.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{candidate.sourceName} <ArrowUpRight size={13} /></a>{candidate.kind === "licensed_import" && <button className="button" type="button" disabled={Boolean(importing)} onClick={() => importCandidate(candidate)}>{importing === candidate.id ? "Importando…" : "Importar e validar"}</button>}</div></article>)}</div>}
      {job?.result?.kind === "create" && <article className="card" style={{ marginTop: 28 }}><div className="badge-row"><span className="badge success"><CheckCircle2 size={12} />{job.result.package.problem.status}</span><span className="badge">{job.result.package.problem.visibility}</span></div><h2 style={{ marginTop: 16 }}>{job.result.package.problem.title}</h2><p className="muted">{job.result.package.problem.summary}</p><ul className="validation-list">{job.result.package.validation.checks.map((check) => <li key={check.name} className={check.passed ? "success-text" : "danger-text"}>{check.passed ? "✓" : "×"} {check.name}{check.message ? ` — ${check.message}` : ""}</li>)}</ul>{job.result.package.validation.valid && <a className="button primary" href={`/problemas/${job.result.package.problem.slug}${job.result.package.accessKey ? `?access_key=${encodeURIComponent(job.result.package.accessKey)}` : ""}`}>Resolver agora</a>}</article>}
    </main>
  </div>;
}
