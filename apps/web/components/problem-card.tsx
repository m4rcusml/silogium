import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProblemDefinition } from "@silogium/core";
import type { ProblemProgress } from "./execution-activity";

const difficulty = { easy: "Fácil", medium: "Média", hard: "Difícil" } as const;

export function ProblemCard({ problem, progress, progressScope = "recent" }: { problem: ProblemDefinition; progress?: ProblemProgress; progressScope?: "complete" | "recent" }) {
  const languages = problem.runtimes.map((item) => item.language === "typescript" ? "TypeScript" : "Python");
  const attribution = problem.provenance.kind === "native"
    ? `Silogium · @${problem.provenance.createdByHandle ?? problem.provenance.createdBy}${problem.provenance.assistedByAi ? " + IA" : ""}`
    : `${problem.provenance.sourceName} · ${problem.provenance.licenseSpdx}`;
  return (
    <Link className="problem-row problem-card" href={`/problemas/${problem.slug}`}>
      <div className="problem-primary"><strong>{problem.title}</strong><span className="problem-summary">{problem.summary}</span><span className="problem-tags">{problem.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</span>{progress && <span className={`problem-progress ${progress.status}`}><span>{progress.status === "solved" ? "✓ Resolvida" : progress.status === "in_progress" ? "Em andamento" : progressScope === "complete" ? "Não iniciada nesta versão" : "Sem atividade no recorte recente"}</span>{progress.best && <span>Melhor: {progress.best.score}/{progress.best.maxScore}</span>}</span>}</div>
      <span data-label="Dificuldade">{difficulty[problem.difficulty]}</span>
      <span data-label="Formato">{problem.format === "progressive" ? `${problem.stages.length} níveis` : "Clássica"}</span>
      <span data-label="Runtime">{languages.map((language) => language === "TypeScript" ? "TS" : "PY").join(" · ")}</span>
      <span className="problem-origin" data-label="Origem">{attribution}</span>
      <ArrowRight size={15} aria-hidden="true" />
    </Link>
  );
}
