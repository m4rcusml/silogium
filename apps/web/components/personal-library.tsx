"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProblemDefinition, StudyList } from "@silogium/core";
import { usePersonalWorkspace } from "./use-personal-workspace";

type Recommendation = { id: string; title: string; slug: string; reason: string };
type SimulationSummary = { id: string; title: string; active: boolean; endsAt: string; completed: number; attempts: number; problemIds: string[]; versions: Record<string, number> };

export function FavoriteProblem({ problemId }: { problemId: string }) {
  const workspace = usePersonalWorkspace();
  const saved = workspace.data?.state.favorites.includes(problemId) ?? false;
  return <div className="personal-favorite"><button className="button ghost" aria-pressed={saved} disabled={workspace.busy || !workspace.data} onClick={() => void workspace.mutate({ kind: "favorite", problemId, saved: !saved })}>{saved ? "★ Nos favoritos" : "☆ Salvar nos favoritos"}</button>{workspace.error && <p className="muted" role="status">Não foi possível carregar favoritos. <button className="button ghost" onClick={() => void workspace.refresh()}>Tentar novamente</button></p>}</div>;
}

export function PersonalLibrary({ problems }: { problems: ProblemDefinition[] }) {
  const workspace = usePersonalWorkspace();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadError, setLoadError] = useState("");
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"list" | "track">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string>();
  const [minutes, setMinutes] = useState(60);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const load = () => {
      void fetch("/api/v1/personal/recommendations").then(async (response) => { if (response.ok) setRecommendations((await response.json()).recommendations); }).catch(() => {});
      void fetch("/api/v1/personal/simulations").then(async (response) => { if (!response.ok) throw new Error(); setSimulations((await response.json()).simulations); setLoadError(""); }).catch(() => setLoadError("Não foi possível atualizar os simulados."));
    };
    load(); window.addEventListener("silogium:execution-saved", load); window.addEventListener("silogium:personal-changed", load);
    return () => { window.removeEventListener("silogium:execution-saved", load); window.removeEventListener("silogium:personal-changed", load); };
  }, []);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(interval); }, []);
  const available = new Map([...problems, ...(workspace.data?.problems ?? [])].map((problem) => [problem.id, problem]));
  const selectList = (list: StudyList) => { setEditing(list.id); setTitle(list.title); setKind(list.kind); setSelected(list.problemIds); setNotice(""); };
  const reset = () => { setEditing(undefined); setTitle(""); setKind("list"); setSelected([]); };
  const problemLink = (id: string, version?: number) => available.get(id) ? <Link href={`/problemas/${available.get(id)!.slug}${version ? `?version=${version}` : ""}`}>{available.get(id)!.title}{version ? ` · v${version}` : ""}</Link> : <span>Questão indisponível</span>;
  return <section className="personal-library container" aria-label="Biblioteca pessoal e sugestões">
    {recommendations.length > 0 && <div className="personal-recommendations"><h2>Para continuar</h2><div>{recommendations.map((item) => <Link href={`/problemas/${item.slug}`} key={item.id}><strong>{item.title}</strong><span>{item.reason}</span></Link>)}</div><p className="muted">Sugestões pelo histórico e pelos temas disponíveis, não uma medição de proficiência.</p></div>}
    <details className="personal-panel"><summary>Sua biblioteca e simulados</summary>
      <p className="muted">Favoritos, listas e trilhas são privados. Uma trilha é uma lista em que você escolhe a ordem de prática. Esta versão guarda até 100 simulados por conta, sem apagar os anteriores automaticamente.</p>
      {workspace.error && <p role="alert">{workspace.error} <button className="button" onClick={() => void workspace.refresh()}>Recarregar biblioteca</button></p>}
      {loadError && <p className="muted" role="status">{loadError}</p>}
      {workspace.data && <>
        <div className="personal-library-grid"><section><h3>Favoritos</h3>{!workspace.data.state.favorites.length && <p className="muted">Salve questões durante a resolução para encontrá-las aqui.</p>}<ul className="personal-items">{workspace.data.state.favorites.map((id) => <li key={id}>{problemLink(id)}<button className="button ghost" disabled={workspace.busy} onClick={() => void workspace.mutate({ kind: "favorite", problemId: id, saved: false })} aria-label={`Remover favorito ${available.get(id)?.title ?? "indisponível"}`}>Remover</button></li>)}</ul></section>
        <section><h3>Listas e trilhas</h3>{!workspace.data.state.lists.length && <p className="muted">Crie uma seleção de questões para estudar.</p>}<ul className="personal-items">{workspace.data.state.lists.map((list) => <li key={list.id}><details><summary>{list.title} · {list.kind === "track" ? "Trilha" : "Lista"} · {list.problemIds.length}</summary><ol>{list.problemIds.map((id) => <li key={id}>{problemLink(id)}</li>)}</ol><div className="personal-actions"><button className="button" onClick={() => selectList(list)}>Editar</button><button className="button ghost" disabled={workspace.busy} onClick={() => { if (window.confirm("Remover esta lista? As questões e suas soluções serão preservadas.")) void workspace.mutate({ kind: "delete_list", id: list.id }); }}>Remover lista</button></div></details></li>)}</ul></section></div>
        <form className="personal-form" onSubmit={async (event) => { event.preventDefault(); if (await workspace.mutate({ kind: "save_list", id: editing, title, listKind: kind, problemIds: selected })) { setNotice("Lista salva."); reset(); } }}>
          <h3>{editing ? "Editar seleção" : "Nova seleção de prática"}</h3>
          <div className="personal-form-row"><label className="field">Nome da seleção<input className="input" required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field">Organização<select className="select" value={kind} onChange={(event) => setKind(event.target.value as "list" | "track")}><option value="list">Lista</option><option value="track">Trilha ordenada</option></select></label></div>
          <fieldset className="personal-selection"><legend>Selecione as questões</legend>{[...available.values()].map((problem) => <label className="personal-check" key={problem.id}><input type="checkbox" checked={selected.includes(problem.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, problem.id] : selected.filter((id) => id !== problem.id))} /><span>{problem.title}</span></label>)}</fieldset>
          {selected.length > 0 && <ol className="personal-order">{selected.map((id, index) => <li key={id}><span>{available.get(id)?.title ?? "Questão indisponível"}</span><div className="personal-actions"><button type="button" className="button ghost" disabled={index === 0} aria-label={`Mover ${available.get(id)?.title ?? "questão"} para cima`} onClick={() => setSelected((previous) => { const next = [...previous]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>↑</button><button type="button" className="button ghost" aria-label={`Retirar ${available.get(id)?.title ?? "questão indisponível"} da seleção`} onClick={() => setSelected((previous) => previous.filter((item) => item !== id))}>Retirar</button></div></li>)}</ol>}
          <div className="personal-actions"><button className="button primary" disabled={workspace.busy}>Salvar seleção</button>{editing && <button type="button" className="button" onClick={reset}>Cancelar edição</button>}</div>
          <div className="personal-simulation-setup"><h3>Usar esta seleção em um simulado</h3><p className="muted">De 1 a 8 questões, sem fiscalização ou ranking. Só envios concluídos no período e na versão escolhida entram no resumo.</p><label className="field">Duração em minutos<input className="input" type="number" min={5} max={240} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label><button className="button" type="button" disabled={workspace.busy || selected.length < 1 || selected.length > 8 || simulations.some((simulation) => simulation.active && Date.parse(simulation.endsAt) > now)} onClick={async () => { if (await workspace.mutate({ kind: "start_simulation", title: title.trim() || "Simulado de prática", problemIds: selected, minutes })) setNotice("Simulado iniciado. Abra uma das questões abaixo."); }}>Iniciar simulado</button></div>
        </form>
        {simulations.length > 0 && <section className="personal-simulations"><h3>Seus simulados</h3>{[...simulations].reverse().map((simulation) => <article key={simulation.id}><strong>{simulation.title}</strong><p>{simulation.active && Date.parse(simulation.endsAt) > now ? `${Math.ceil((Date.parse(simulation.endsAt) - now) / 60_000)} min restantes` : "Encerrado"} · {simulation.completed}/{simulation.problemIds.length} questões aceitas · {simulation.attempts} envios</p><ul>{simulation.problemIds.map((id) => <li key={id}>{problemLink(id, simulation.versions[id])}</li>)}</ul>{simulation.active && <button className="button" disabled={workspace.busy} onClick={() => void workspace.mutate({ kind: "finish_simulation", id: simulation.id })}>Encerrar simulado</button>}</article>)}</section>}
        {workspace.data.mode === "demo" && <p className="muted">Modo local: biblioteca e simulados pertencem à sessão do servidor. Reiniciar pode apagar esses registros.</p>}
      </>}
      {notice && <p role="status">{notice}</p>}
    </details>
  </section>;
}
