"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, RotateCw } from "lucide-react";
import type { ProblemDefinition } from "@silogium/core";
import { useExecutionActivity, verdictLabels, type ExecutionActivity } from "./execution-activity";

type Props = {
  problemId?: string;
  problemVersion?: number;
  problems?: ProblemDefinition[];
  activity?: ExecutionActivity;
};

export function SubmissionHistory({ problemId, problemVersion, problems = [], activity: suppliedActivity }: Props) {
  const [kind, setKind] = useState<"all" | "run" | "submission">("all");
  const [outcome, setOutcome] = useState<"all" | "accepted" | "failed">("all");
  const filtered = Boolean(problemId || problemVersion || kind !== "all" || outcome !== "all");
  const ownActivity = useExecutionActivity(!suppliedActivity || filtered, { problemId, problemVersion, kind, outcome });
  const activity = suppliedActivity && !filtered ? suppliedActivity : ownActivity;
  const metadata = useMemo(() => new Map(problems.map((problem) => [problem.id, problem])), [problems]);
  const matching = activity.items.filter((item) => (!problemId || item.request.problemId === problemId)
    && (!problemVersion || item.request.problemVersion === problemVersion));
  const visible = matching.filter((item) => (kind === "all" || item.request.kind === kind)
    && (outcome === "all" || (outcome === "accepted" ? item.result.verdict === "accepted" : item.result.verdict !== "accepted")));

  if (activity.state === "unauthenticated") return <div className="empty">Entre na sua conta para ver execuções e submissões. <Link href="/entrar">Entrar</Link></div>;
  if (activity.state === "error") return <div className="empty" role="alert"><p>{activity.error}</p><button type="button" className="button" onClick={activity.refresh}>Tentar novamente</button></div>;

  return <div className="submission-history" aria-busy={activity.state === "loading"}>
    <div className="activity-toolbar">
      <div className="activity-filters">
        <label><span className="sr-only">Filtrar tipo de atividade</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">Todas as atividades</option><option value="submission">Submissões</option><option value="run">Execuções</option></select></label>
        <label><span className="sr-only">Filtrar resultado</span><select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="all">Todos os resultados</option><option value="accepted">Aceitas</option><option value="failed">Com falha</option></select></label>
      </div>
      <button type="button" className="button ghost" onClick={activity.refresh} disabled={activity.state === "loading"}><RotateCw size={14} aria-hidden="true" /> Atualizar</button>
    </div>
    {activity.state === "loading" ? <div className="empty" role="status">Carregando atividade…</div> : !visible.length ? <div className="empty">{matching.length ? "Nenhuma atividade corresponde aos filtros." : `Nenhuma atividade recente${problemId ? ` para esta questão${problemVersion ? ` na versão ${problemVersion}` : ""}` : ""}.`}</div> : <>
      <p className="activity-caption">{activity.total !== undefined ? `${activity.items.length} de ${activity.total} atividades carregadas` : "Atividades carregadas desta conta"}{problemVersion ? ` · versão ${problemVersion}` : ""}. Abra uma linha para ver o resultado e recuperar seu código.</p>
      <div className="activity-list">{visible.map((item) => {
        const problem = item.problem ?? metadata.get(item.request.problemId);
        const resultClass = item.result.verdict === "accepted" ? "accepted" : item.result.verdict === "system_error" ? "system" : "failed";
        return <details className="activity-entry" key={item.result.id}>
          <summary className="activity-row">
            <span className={`verdict-dot ${resultClass}`} aria-hidden="true" />
            <div><strong>{problem?.title ?? "Questão indisponível"}</strong><span>Versão {item.request.problemVersion} · {item.request.kind === "submission" ? "Submissão" : "Execução"}{item.request.maxStage ? ` · até o nível ${item.request.maxStage}` : ""}</span></div>
            <span data-label="Linguagem">{item.request.runtime === "typescript" ? "TypeScript" : "Python"}</span>
            <span className={item.result.verdict === "accepted" ? "success-text" : item.result.verdict === "system_error" ? "muted" : "danger-text"} data-label="Resultado">{verdictLabels[item.result.verdict]}</span>
            <span data-label="Pontuação">{item.result.score}/{item.result.maxScore} pontos</span>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
            <ChevronDown size={15} aria-label="Ver detalhes" />
          </summary>
          <div className="activity-details">
            <div className="activity-details-heading"><strong>{verdictLabels[item.result.verdict]}</strong><span>{item.result.score}/{item.result.maxScore} pontos · {item.result.durationMs} ms</span>{problem && <Link href={`/problemas/${problem.slug}`}>{problem.version === item.request.problemVersion ? "Abrir questão" : `Abrir versão atual (${problem.version})`}</Link>}</div>
            {item.result.message && <p className="notice">{item.result.message}</p>}
            <SubmissionCode id={item.result.id} available={item.codeAvailable} />
            {item.result.cases.length > 0 ? <ul className="activity-cases">{item.result.cases.map((testCase) => <li key={testCase.id}><div><span className={testCase.passed ? "success-text" : "danger-text"}>{testCase.passed ? "✓ Passou" : "× Falhou"}</span><strong>{testCase.name}</strong><span>Nível {testCase.stage}</span></div>{testCase.message && <pre>{testCase.message}</pre>}</li>)}</ul> : <p className="muted">Nenhum caso foi concluído nesta tentativa.</p>}
          </div>
        </details>;
      })}</div>
    </>}
    {activity.pageError && <p role="alert">{activity.pageError}</p>}
    {activity.nextCursor && <button type="button" className="button" disabled={activity.loadingMore} onClick={activity.loadMore}>{activity.loadingMore ? "Carregando…" : "Carregar mais atividades"}</button>}
  </div>;
}

function SubmissionCode({ id, available }: { id: string; available?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [detail, setDetail] = useState<{ source?: string; reopenUrl?: string | null }>();
  if (available === false) return <p className="muted">O código desta atividade antiga não foi preservado. Os novos envios guardam o código e a versão.</p>;
  async function open() {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(`/api/v1/submissions/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível recuperar o código.");
      setDetail(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao recuperar o código."); }
    finally { setLoading(false); }
  }
  return <div style={{ display: "grid", gap: 12, marginBlock: 16 }}>
    {!detail ? <button className="button" type="button" style={{ justifySelf: "start" }} onClick={open} disabled={loading}>{loading ? "Recuperando…" : "Ver meu código"}</button> : <>
      {detail.source !== undefined ? <pre style={{ maxHeight: 320, overflow: "auto", padding: 16, border: "1px solid var(--border)", borderRadius: 8 }}><code>{detail.source}</code></pre> : <p className="muted">Código indisponível para esta atividade antiga.</p>}
      {detail.reopenUrl ? <Link className="button" style={{ justifySelf: "start" }} href={detail.reopenUrl}>Reabrir código nesta versão</Link> : <p className="muted">A versão da questão não está mais disponível. Seu histórico foi mantido.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
