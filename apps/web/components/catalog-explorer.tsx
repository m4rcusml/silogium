"use client";

import { useMemo, useState } from "react";
import { searchCatalog, type ProblemDefinition, type Runtime } from "@silogium/core";
import { ProblemCard } from "./problem-card";

export function CatalogExplorer({ problems }: { problems: ProblemDefinition[] }) {
  const [query, setQuery] = useState("");
  const [runtime, setRuntime] = useState<Runtime | "">("");
  const [difficulty, setDifficulty] = useState<ProblemDefinition["difficulty"] | "">("");
  const [format, setFormat] = useState<ProblemDefinition["format"] | "">("");
  const filtered = useMemo(() => searchCatalog(problems, {
    query, runtime: runtime || undefined, difficulty: difficulty || undefined, format: format || undefined
  }), [problems, query, runtime, difficulty, format]);

  return <>
    <div className="filters">
      <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por tema, título ou tag" aria-label="Buscar questões" />
      <select className="select" value={runtime} onChange={(event) => setRuntime(event.target.value as Runtime | "")} aria-label="Filtrar linguagem"><option value="">Todas as linguagens</option><option value="typescript">TypeScript</option><option value="python">Python</option></select>
      <select className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as ProblemDefinition["difficulty"] | "")} aria-label="Filtrar dificuldade"><option value="">Toda dificuldade</option><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select>
      <select className="select" value={format} onChange={(event) => setFormat(event.target.value as ProblemDefinition["format"] | "")} aria-label="Filtrar formato"><option value="">Todos os formatos</option><option value="classic">Clássica</option><option value="progressive">Progressiva</option></select>
    </div>
    {filtered.length ? <div className="grid">{filtered.map((problem) => <ProblemCard key={problem.id} problem={problem} />)}</div> : <div className="empty">Nenhuma questão corresponde aos filtros.</div>}
  </>;
}
