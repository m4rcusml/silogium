"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  createdAt: string;
  request: { problemId: string; problemVersion: number; runtime: string; kind: string };
  result: { id: string; verdict: string; score: number; maxScore: number; durationMs: number };
};

export function SubmissionHistory() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch("/api/v1/executions").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o histórico.");
      setItems(body.executions ?? []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Falha inesperada."));
  }, []);
  if (error) return <div className="empty">{error}</div>;
  if (!items) return <div className="empty">Carregando submissões…</div>;
  if (!items.length) return <div className="empty">Você ainda não executou ou submeteu uma solução.</div>;
  return <div className="result-list">{items.map((item) => <article className="card" key={item.result.id}>
    <div className="badge-row"><span className={`badge ${item.result.verdict === "accepted" ? "success" : ""}`}>{item.result.verdict}</span><span className="badge">{item.request.kind === "submission" ? "Submissão" : "Execução"}</span><span className="badge">{item.request.runtime}</span></div>
    <h3 style={{ marginTop: 14 }}>Questão {item.request.problemId.slice(0, 8)} · versão {item.request.problemVersion}</h3>
    <p className="muted">{item.result.score}/{item.result.maxScore} pontos · {item.result.durationMs} ms · {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
    <Link className="source-link" href={`/api/v1/executions/${item.result.id}`}>Ver resultado</Link>
  </article>)}</div>;
}
