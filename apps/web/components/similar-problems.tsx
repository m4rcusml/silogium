"use client";

import Link from "next/link";
import { discoveryLabel, type ContentRequest } from "@silogium/core";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { visibilityLabel } from "./studio-request";
import type { Candidate } from "./use-studio-job";

type CreateRequest = Extract<ContentRequest, { mode: "create" }>;
const difficultyLabel = { easy: "Fácil", medium: "Média", hard: "Difícil" };

export function CandidateDetails({ candidate }: { candidate: Candidate }) {
  const concepts = [...new Set([...(candidate.metadata?.concepts ?? []), ...(candidate.metadata?.skills ?? [])])].slice(0, 6);
  return <>
    {concepts.length > 0 && <ul className="similar-tags" aria-label="Conceitos e habilidades">{concepts.map((concept) => <li key={concept}>{discoveryLabel(concept)}</li>)}</ul>}
    {Boolean(candidate.matchReasons?.length) && <p className="similar-reasons">{candidate.matchReasons!.slice(0, 3).join(" · ")}</p>}
  </>;
}

export function CandidateOrigin({ candidate }: { candidate: Candidate }) {
  return <span className="result-origin">{candidate.kind === "catalog" ? candidate.sourceName : candidate.kind === "licensed_import" ? `Fonte licenciada · ${candidate.sourceName}` : `Link externo · ${candidate.sourceName}`}{candidate.licenseSpdx ? ` · ${candidate.licenseSpdx}` : ""}</span>;
}

export function SimilarProblems({ candidates, snapshot, edited, busy, error, onConfirm, onAdjust, onRetry }: {
  candidates: Candidate[];
  snapshot: CreateRequest;
  edited: boolean;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onAdjust: () => void;
  onRetry: () => void;
}) {
  return <section className="similar-problems" aria-labelledby="similar-heading">
    <header className="similar-heading"><span className="eyebrow">Antes de criar</span><h2 id="similar-heading">Encontramos questões parecidas</h2><p>Você pode aproveitar uma destas questões. Nenhuma nova questão foi gerada nesta análise.</p></header>
    <details className="similar-request" open>
      <summary>Pedido analisado</summary>
      <p className="similar-prompt">{snapshot.prompt}</p>
      <dl className="similar-request-fields">
        <div><dt>Linguagem</dt><dd>{snapshot.runtime === "typescript" ? "TypeScript" : "Python"}</dd></div>
        <div><dt>Formato</dt><dd>{snapshot.format === "progressive" ? "Progressiva" : "Clássica"}</dd></div>
        <div><dt>Dificuldade</dt><dd>{difficultyLabel[snapshot.difficulty]}</dd></div>
        <div><dt>Visibilidade</dt><dd>{snapshot.visibility === "public" ? "Solicitar publicação" : visibilityLabel[snapshot.visibility]}</dd></div>
      </dl>
    </details>
    <div className="similar-list">
      {candidates.slice(0, 5).map((candidate) => <article className="similar-candidate" key={candidate.id}>
        <div className="similar-candidate-copy"><CandidateOrigin candidate={candidate} /><h3>{candidate.title}</h3><p>{candidate.summary}</p><CandidateDetails candidate={candidate} /></div>
        <div className="similar-candidate-actions">{candidate.kind === "catalog"
          ? <Link className="button" href={candidate.url}>Resolver</Link>
          : <a className="button" href={candidate.url} target="_blank" rel="noreferrer">Ver na fonte <ArrowUpRight size={14} /></a>}
          {candidate.kind !== "catalog" && <span>Abre no site original</span>}
        </div>
      </article>)}
    </div>
    <footer className="similar-decision">
      <div><h3>Quer criar uma nova questão mesmo assim?</h3><p>A criação usará o pedido analisado acima. As questões sugeridas servem como referência de conceitos, não para copiar enunciados ou soluções.</p></div>
      {edited && <p className="similar-edited" role="status">O formulário está diferente do pedido analisado. Para usar suas alterações, envie o formulário novamente. Confirmar aqui mantém o pedido original acima.</p>}
      {error && <div className="similar-confirm-error" role="alert"><p>{error}</p><button className="button" type="button" onClick={onRetry} disabled={busy}>Consultar este pedido</button></div>}
      <div className="similar-actions"><button className="button primary" type="button" onClick={onConfirm} disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{busy ? "Confirmando criação…" : "Criar nova mesmo assim"}</button><button className="button" type="button" onClick={onAdjust} disabled={busy}>Ajustar pedido</button></div>
    </footer>
  </section>;
}
