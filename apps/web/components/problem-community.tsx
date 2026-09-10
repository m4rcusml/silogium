"use client";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CommunityPost } from "@silogium/core";

type Post = Omit<CommunityPost, "authorId"> & { mine: boolean };
const kindLabel = { discussion: "Discussão", solution: "Solução comentada", hint: "Dica", editorial: "Editorial" };
const statusLabel = { pending: "Aguardando revisão", approved: "Publicada", rejected: "Correção solicitada", removed: "Removida" };
export function ProblemCommunity({ problemId, version, published }: { problemId: string; version: number; published: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canContribute, setCanContribute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<CommunityPost["kind"]>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string>();
  const [reportId, setReportId] = useState<string>();
  const [reason, setReason] = useState("");
  const url = `/api/v1/community/${problemId}`;
  const load = useCallback(async () => {
    if (!published) return;
    try { const response = await fetch(`${url}?version=${version}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setPosts(payload.posts); setCanContribute(payload.canContribute); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Falha ao carregar contribuições."); }
  }, [published, url, version]);
  useEffect(() => { void load(); }, [load]);
  async function send(payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version, ...payload }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await load(); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar."); return false; }
    finally { setBusy(false); }
  }
  if (!published) return <p className="muted">Dicas públicas e comunidade estarão disponíveis depois da aprovação desta questão no catálogo.</p>;
  return <section className="community-panel">
    <header><h2>Dicas e comunidade</h2><p className="muted">Conteúdo revisado para a versão {version}. Abra dicas e soluções somente quando quiser ver spoilers.</p></header>
    {error && <div role="alert">{error} <button className="button ghost" onClick={() => void load()}>Tentar novamente</button></div>}
    {!posts.length && !error && <p className="muted">Ainda não há contribuições nesta versão.</p>}
    {posts.map((post, index) => <article className="community-post" key={post.id}>
      <div className="community-post-meta"><span>{kindLabel[post.kind]} · @{post.authorHandle}</span><span>{statusLabel[post.status]}</span></div>
      {post.kind === "discussion" ? <><h3>{post.title}</h3><div className="markdown"><ReactMarkdown>{post.body}</ReactMarkdown></div></> : <details><summary>{post.kind === "hint" ? `Revelar dica ${posts.slice(0, index + 1).filter((item) => item.kind === "hint").length}` : `Revelar ${kindLabel[post.kind].toLowerCase()}`} — {post.title}</summary><div className="markdown"><ReactMarkdown>{post.body}</ReactMarkdown></div></details>}
      {post.reason && <p className="notice">Revisão: {post.reason}</p>}
      <div className="personal-actions">{post.mine ? <><button className="button ghost" onClick={() => { setEditingId(post.id); setEditingUpdatedAt(post.updatedAt); setKind(post.kind); setTitle(post.title); setBody(post.body); }}>Editar contribuição</button><button className="button ghost" disabled={busy} onClick={async () => { if (window.confirm("Remover o texto desta contribuição?")) await send({ action: "remove", postId: post.id, expectedUpdatedAt: post.updatedAt }); }}>Remover contribuição</button></> : canContribute && post.status === "approved" && <button className="button ghost" onClick={() => { setReportId(post.id); setReason(""); }}>Denunciar</button>}</div>
    </article>)}
    {reportId && <form className="personal-form" onSubmit={async (event) => { event.preventDefault(); if (await send({ action: "report", postId: reportId, reason })) { setReportId(undefined); setNotice("Denúncia enviada para revisão."); } }}><label className="field">Motivo da denúncia<textarea className="textarea" required minLength={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="personal-actions"><button className="button" disabled={busy}>Enviar denúncia</button><button className="button ghost" type="button" onClick={() => setReportId(undefined)}>Cancelar denúncia</button></div></form>}
    {canContribute ? <details className="community-compose" open={editingId ? true : undefined}><summary>{editingId ? "Corrigir contribuição" : "Contribuir com esta questão"}</summary><form className="personal-form" onSubmit={async (event) => { event.preventDefault(); if (await send({ content: { kind, title, body }, postId: editingId, expectedUpdatedAt: editingUpdatedAt })) { setEditingId(undefined); setEditingUpdatedAt(undefined); setTitle(""); setBody(""); setNotice("Contribuição salva. Ela ficará pública depois da revisão administrativa."); } }}>
      <label className="field">Tipo de contribuição<select className="select" value={kind} onChange={(event) => setKind(event.target.value as CommunityPost["kind"])}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Título<input className="input" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field">Texto em Markdown<textarea className="textarea" required minLength={5} maxLength={20000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <p className="muted">Publique somente texto e código que você pode compartilhar. Não inclua dados pessoais nem testes ocultos. Editar uma contribuição publicada a envia novamente para revisão.</p>
      <div className="personal-actions"><button className="button primary" disabled={busy}>Enviar para revisão</button>{editingId && <button className="button" type="button" onClick={() => { setEditingId(undefined); setEditingUpdatedAt(undefined); setTitle(""); setBody(""); }}>Cancelar edição</button>}</div>
    </form></details> : <p className="muted">Entre para contribuir ou denunciar conteúdo.</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

export function CommunityReviewPanel() {
  const [posts, setPosts] = useState<Array<CommunityPost & { reports: Array<{ reason: string }> }>>([]);
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const load = useCallback(async () => { try { const response = await fetch("/api/v1/community/review"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setPosts(body.posts); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "Fila indisponível."); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(postId: string, decision: "approve" | "reject" | "remove") {
    setBusy(postId); setError("");
    try { const response = await fetch("/api/v1/community/review", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId, decision, reason: reasons[postId] ?? "", expectedUpdatedAt: posts.find((post) => post.id === postId)?.updatedAt }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Falha ao revisar."); } finally { setBusy(undefined); }
  }
  return <section className="community-panel community-review"><h2>Contribuições e denúncias</h2>{error && <p role="alert">{error} <button className="button" onClick={() => void load()}>Recarregar</button></p>}{!posts.length && !error && <p className="muted">Nenhuma contribuição ou denúncia aguarda revisão.</p>}{posts.map((post) => <article key={post.id} className="community-post"><span>{kindLabel[post.kind]} · @{post.authorHandle} · v{post.problemVersion}</span><h3>{post.title}</h3><div className="markdown"><ReactMarkdown>{post.body}</ReactMarkdown></div>{post.reports.map((report, index) => <p className="notice" key={index}>Denúncia: {report.reason}</p>)}<label className="field">Orientação ao autor / motivo<textarea className="textarea" maxLength={1000} value={reasons[post.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [post.id]: event.target.value })} /></label><div className="personal-actions"><button className="button primary" disabled={Boolean(busy)} onClick={() => void decide(post.id, "approve")}>Aprovar contribuição</button><button className="button" disabled={Boolean(busy) || (reasons[post.id]?.trim().length ?? 0) < 5} onClick={() => void decide(post.id, "reject")}>Solicitar correção</button><button className="button" disabled={Boolean(busy) || (reasons[post.id]?.trim().length ?? 0) < 5} onClick={() => void decide(post.id, "remove")}>Ocultar contribuição</button></div></article>)}</section>;
}
