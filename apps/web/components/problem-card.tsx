import Link from "next/link";
import { ArrowUpRight, Bot, Braces, GitFork } from "lucide-react";
import type { ProblemDefinition } from "@silogium/core";

const difficulty = { easy: "Fácil", medium: "Média", hard: "Difícil" } as const;

export function ProblemCard({ problem }: { problem: ProblemDefinition }) {
  const languages = problem.runtimes.map((item) => item.language === "typescript" ? "TypeScript" : "Python");
  const attribution = problem.provenance.kind === "native"
    ? <><Bot size={12} /> Silogium · @{problem.provenance.createdByHandle ?? "autor"}{problem.provenance.assistedByAi ? " + IA" : ""}</>
    : <>Importada · {problem.provenance.sourceName} · {problem.provenance.licenseSpdx}</>;
  return (
    <Link className="card problem-card" href={`/problemas/${problem.slug}`}>
      <div className="badge-row">
        <span className="badge accent">{difficulty[problem.difficulty]}</span>
        <span className="badge"><GitFork size={12} />{problem.format === "progressive" ? `${problem.stages.length} níveis` : "Clássica"}</span>
      </div>
      <h3>{problem.title}</h3>
      <p>{problem.summary}</p>
      <div className="badge-row">{problem.tags.slice(0, 3).map((tag) => <span className="badge" key={tag}>{tag}</span>)}</div>
      <footer>
        <span>{attribution}</span>
        <span><Braces size={12} /> {languages.join(" · ")}</span>
        <ArrowUpRight size={14} />
      </footer>
    </Link>
  );
}
