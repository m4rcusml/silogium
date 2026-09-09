"use client";

import { useEffect, useState } from "react";

type Review = { problem: { id: string; title: string; summary: string; difficulty: string; tags: string[] }; validation: { checks: Array<{ name: string; passed: boolean }> } };

export function ReviewPanel() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const load = () => fetch("/api/v1/reviews").then((response) => response.json()).then((body) => setReviews(body.reviews ?? []));
  useEffect(() => { void load(); }, []);
  async function decide(id: string, decision: "approve" | "reject") {
    await fetch(`/api/v1/reviews/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    await load();
  }
  if (!reviews) return <div className="empty">Carregando fila…</div>;
  if (!reviews.length) return <div className="empty">Nenhuma questão aguarda revisão.</div>;
  return <div className="result-list">{reviews.map(({ problem, validation }) => <article className="card" key={problem.id}><div className="badge-row"><span className="badge accent">{problem.difficulty}</span>{problem.tags.map((tag) => <span className="badge" key={tag}>{tag}</span>)}</div><h2 style={{ marginTop: 14 }}>{problem.title}</h2><p className="muted">{problem.summary}</p><p className="muted">{validation.checks.filter((item) => item.passed).length}/{validation.checks.length} verificações aprovadas</p><div className="hero-actions"><button className="button primary" onClick={() => decide(problem.id, "approve")}>Aprovar</button><button className="button" onClick={() => decide(problem.id, "reject")}>Rejeitar</button></div></article>)}</div>;
}
