"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ProblemDefinition } from "@silogium/core";

export function MyProblems() {
  const [problems, setProblems] = useState<ProblemDefinition[] | null>(null);
  const [message, setMessage] = useState<string>();
  const load = () => fetch("/api/v1/problems/mine").then((response) => response.json()).then((body) => setProblems(body.problems ?? []));
  useEffect(() => { void load(); }, []);
  async function publish(problem: ProblemDefinition) {
    if (!window.confirm("Ao publicar, o enunciado ficará sob CC BY 4.0 e o starter e os testes visíveis sob MIT. Deseja continuar?")) return;
    const response = await fetch(`/api/v1/problems/${problem.slug}/publication`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ licensesAccepted: true }) });
    const body = response.status === 204 ? null : await response.json();
    setMessage(response.ok ? "Questão enviada para revisão editorial." : body?.error ?? "Não foi possível solicitar publicação.");
    if (response.ok) await load();
  }
  if (!problems) return <div className="empty">Carregando rascunhos…</div>;
  if (!problems.length) return <div className="empty"><Sparkles size={24} /><h2>Seu próximo rascunho começa no assistente.</h2><p>Questões privadas, não listadas e pedidos de publicação aparecerão aqui.</p><Link className="button primary" href="/assistente">Criar questão</Link></div>;
  return <>{message && <div className="card" style={{ marginBottom: 18 }}>{message}</div>}<div className="grid">{problems.map((problem) => <article className="card" key={problem.id}><div className="badge-row"><span className="badge accent">{problem.status}</span><span className="badge">{problem.visibility}</span></div><h2 style={{ marginTop: 14 }}>{problem.title}</h2><p className="muted">{problem.summary}</p><div className="hero-actions"><Link className="button" href={`/problemas/${problem.slug}`}>Resolver</Link>{problem.status === "validated" && <button type="button" className="button primary" onClick={() => publish(problem)}>Solicitar publicação</button>}</div></article>)}</div></>;
}
