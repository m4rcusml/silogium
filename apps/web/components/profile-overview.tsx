"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Check, FilePenLine, Monitor, RotateCw, ShieldCheck, TerminalSquare } from "lucide-react";
import type { Actor } from "@silogium/core";
import { summarizeProfileActivity } from "@/lib/profile-summary";
import { useExecutionActivity, verdictLabels } from "./execution-activity";
import { TokenManager } from "./token-manager";
import { usePracticeOverview } from "./use-practice-overview";
import { PracticeProfilePanel } from "./practice-progress";
import { PersonalProfileSettings } from "./personal-profile-settings";
import { ProfileBetaNotice } from "./profile-beta-notice";

export function ProfileOverview({ actor }: { actor: Actor }) {
  const activity = useExecutionActivity();
  const practice = usePracticeOverview();
  const summary = practice.data?.activity ?? summarizeProfileActivity(activity.items);
  const local = actor.id === "local-demo";
  const ready = activity.state === "ready";

  return <main className="container page profile-page">
    <header className="profile-heading">
      <div className="profile-identity">
        <span className="profile-monogram" aria-hidden="true">{actor.handle.slice(0, 2).toUpperCase()}</span>
        <div className="profile-identity-copy"><span className="eyebrow">Meu perfil</span><h1>@{actor.handle}</h1><p>{local ? "Seu espaço de prática neste ambiente local." : "Sua prática, suas questões e seu acesso ao terminal."}</p></div>
      </div>
      <Link className="button primary" href="/explorar"><BookOpen size={16} aria-hidden="true" /> Praticar</Link>
    </header>
    <ProfileBetaNotice actorId={actor.id} />

    <div className="profile-layout">
      <div className="profile-main-column">
        <section className="profile-panel" aria-labelledby="profile-summary-title" aria-busy={activity.state === "loading"}>
          <div className="profile-section-heading"><div><h2 id="profile-summary-title">{practice.data ? "Sua prática" : "Sua prática recente"}</h2><p>{practice.data ? (practice.data.mode === "demo" ? "Todas as execuções preservadas nesta sessão local." : "Resumo de todo o histórico da conta, sem limite de 100 execuções.") : `Recorte das últimas ${activity.historyLimit ?? 100} execuções carregadas.`}</p></div><button className="button ghost" type="button" onClick={() => { activity.refresh(); practice.refresh(); }} disabled={activity.state === "loading"}><RotateCw size={14} aria-hidden="true" /><span>Atualizar</span></button></div>
          {activity.state === "loading" && <p className="profile-state" role="status">Carregando seu resumo…</p>}
          {activity.state === "error" && <div className="profile-state" role="alert"><p>{activity.error ?? "Não foi possível carregar sua atividade."}</p><button type="button" className="button" onClick={activity.refresh}>Tentar novamente</button></div>}
          {activity.state === "unauthenticated" && <div className="profile-state"><p>Sua sessão expirou. Entre novamente para ver sua atividade.</p><Link className="button" href="/entrar">Entrar</Link></div>}
          {ready && <>
            <dl className="profile-stats">
              <div><dt>Questões praticadas</dt><dd>{summary.problemsPracticed}</dd><span>{practice.data ? "Questões distintas no histórico" : "Questões distintas no recorte"}</span></div>
              <div><dt>Submissões</dt><dd>{summary.submissions}</dd><span>Envios feitos com Submeter</span></div>
              <div><dt>Submissões aceitas</dt><dd>{summary.acceptedSubmissions}</dd><span>Sem contar o botão Executar</span></div>
            </dl>
            <p className="profile-caption">{summary.runs} {summary.runs === 1 ? "execução de teste" : "execuções de teste"} no período exibido. Falhas de infraestrutura não entram nos contadores. Aceites parciais não representam questões concluídas.</p>
            <div className="profile-languages"><h3>Linguagens praticadas</h3>{summary.languages.length ? <ul>{summary.languages.map(({ runtime, attempts }) => <li key={runtime}><span className={`profile-language-dot ${runtime}`} aria-hidden="true" /><strong>{runtime === "typescript" ? "TypeScript" : "Python"}</strong><span>{attempts} {attempts === 1 ? "tentativa" : "tentativas"}</span></li>)}</ul> : <p>Suas linguagens aparecerão depois da primeira tentativa.</p>}</div>
          </>}
        </section>

        {practice.loading && !practice.data && <section className="profile-panel"><p role="status" className="profile-caption">Calculando histórico completo e preferências de prática…</p></section>}
        {practice.error && <section className="profile-panel"><p role="alert">{practice.error}</p><p className="profile-caption">O histórico existente continua disponível. Não é necessário reenviar sua solução.</p><button type="button" className="button" onClick={practice.refresh}>Atualizar progresso</button></section>}
        {practice.data && <PracticeProfilePanel key={practice.data.preferences.preferences.timeZone} data={practice.data} refresh={practice.refresh} />}

        <section className="profile-panel" aria-labelledby="profile-activity-title">
          <div className="profile-section-heading"><div><h2 id="profile-activity-title">Últimas atividades</h2><p>Retome uma questão ou consulte o resultado completo.</p></div><Link className="profile-text-link" href="/explorar?view=activity">Ver histórico <ArrowRight size={14} aria-hidden="true" /></Link></div>
          {activity.state === "loading" ? <p className="profile-state" role="status">Carregando atividades…</p> : !ready ? <p className="profile-caption">As atividades aparecerão quando o histórico estiver disponível.</p> : activity.items.length === 0 ? <div className="profile-state"><BookOpen size={22} aria-hidden="true" /><h3>Sua primeira tentativa começa aqui</h3><p>Escolha uma questão e execute os testes. O resultado ficará neste espaço.</p><Link className="button" href="/explorar">Escolher questão <ArrowRight size={14} aria-hidden="true" /></Link></div> : <ul className="profile-activity-list">{activity.items.slice(0, 4).map((item) => <li key={item.result.id}>
            <span className={`profile-activity-mark ${item.result.verdict === "accepted" ? "accepted" : ""}`} aria-hidden="true">{item.result.verdict === "accepted" ? <Check size={16} /> : <TerminalSquare size={16} />}</span>
            <div className="profile-activity-copy">{item.problem ? <Link href={`/problemas/${item.problem.slug}`}>{item.problem.title}</Link> : <strong>Questão indisponível</strong>}<span>{item.request.kind === "submission" ? "Submissão" : "Execução"} · {item.request.runtime === "typescript" ? "TypeScript" : "Python"} · v{item.request.problemVersion}{item.request.maxStage ? ` · até o nível ${item.request.maxStage}` : ""}</span><span className={item.result.verdict === "accepted" ? "success-text" : item.result.verdict === "system_error" ? "muted" : "danger-text"}>{verdictLabels[item.result.verdict]} · {item.result.score}/{item.result.maxScore} pontos</span>{item.problem && item.problem.version !== item.request.problemVersion && <span>O link abre a versão atual ({item.problem.version}).</span>}</div>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
          </li>)}</ul>}
        </section>
      </div>

      <aside className="profile-side-column" aria-label="Conta e atalhos">
        <section className="profile-panel" aria-labelledby="profile-account-title"><div className="profile-section-heading"><h2 id="profile-account-title">Sua conta</h2>{local ? <Monitor size={18} className="muted" aria-hidden="true" /> : <ShieldCheck size={18} className="muted" aria-hidden="true" />}</div><dl className="profile-account-details"><div><dt>Ambiente</dt><dd>{local ? "Demonstração local" : "Conta autenticada"}</dd></div><div><dt>Permissão</dt><dd>{actor.role === "admin" ? "Administrador" : "Participante"}</dd></div></dl><p className="profile-caption">{local ? "Esta conta de demonstração é compartilhada neste servidor. Questões, atividade e tokens locais ficam em memória e podem ser perdidos ao reiniciar." : "Este resumo é visível apenas na sua sessão. A visibilidade de cada questão é definida separadamente no Studio."}</p></section>
        <section className="profile-panel" aria-labelledby="profile-shortcuts-title"><h2 id="profile-shortcuts-title">Seu espaço</h2><div className="profile-shortcuts"><Link href="/studio?section=mine"><FilePenLine size={17} aria-hidden="true" /><span><strong>Minhas questões</strong><small>Organize e publique pelo Studio</small></span><ArrowRight size={15} aria-hidden="true" /></Link><Link href="/studio?mode=create"><BookOpen size={17} aria-hidden="true" /><span><strong>Criar uma questão</strong><small>Escolha o tema e a linguagem</small></span><ArrowRight size={15} aria-hidden="true" /></Link><a href="#terminal-access"><TerminalSquare size={17} aria-hidden="true" /><span><strong>Resolver pelo terminal</strong><small>Gerencie seus tokens abaixo</small></span><ArrowRight size={15} aria-hidden="true" /></a></div></section>
      </aside>
    </div>
    <PersonalProfileSettings />
    <TokenManager localMode={local} />
  </main>;
}
