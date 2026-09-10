"use client";

import { useEffect, useState } from "react";
import type { BetaParticipant, BetaInvitation } from "@/lib/beta";
import { readStudioResponse, studioError } from "./studio-request";

type AccessList = { participants: BetaParticipant[]; invitations: BetaInvitation[] };
const labels = { pending: "Na lista de espera", approved: "Acesso liberado", rejected: "Pedido recusado", revoked: "Acesso revogado" };
type Decision = "approve" | "reject" | "revoke";

export function BetaAccessPanel() {
  const [data, setData] = useState<AccessList>();
  const [filter, setFilter] = useState("pending");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reload, setReload] = useState(0);
  const [decision, setDecision] = useState<{ person: BetaParticipant; action: Decision }>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setError(undefined);
    fetch("/api/v1/admin/beta", { cache: "no-store", signal: controller.signal })
      .then(response => readStudioResponse<AccessList>(response, "Não foi possível carregar os participantes"))
      .then(value => { if (active) setData(value); })
      .catch(caught => { if (active) setError(studioError(caught)); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [reload]);

  async function change(input: { action: "invite"; githubHandle: string } | { action: "revoke_invite"; githubId: string } | { action: Decision; userId: string }) {
    if (busy) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      await readStudioResponse(await fetch("/api/v1/admin/beta", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: controller.signal }), "Não foi possível atualizar o acesso");
      setNotice(input.action === "invite" ? "Identidade do GitHub pré-aprovada. Envie o link do Silogium à pessoa; nenhum e-mail foi enviado." : input.action === "revoke_invite" ? "Pré-aprovação removida. Para retirar o acesso de alguém já aprovado, revogue a pessoa na lista de participantes." : "Decisão de acesso salva. A mudança vale também para a CLI.");
      setDecision(undefined); setHandle(""); setReload(value => value + 1);
    } catch (caught) {
      setError(controller.signal.aborted ? "A resposta demorou. Atualize a lista antes de repetir a decisão." : studioError(caught));
    } finally { clearTimeout(timeout); setBusy(false); }
  }

  const people = data?.participants.filter(person => filter === "all" || person.state === filter);
  return <section className="beta-panel card" aria-labelledby="beta-panel-heading">
    <header><span className="eyebrow">Beta fechado</span><h2 id="beta-panel-heading">Quem pode participar</h2><p className="muted">Qualquer pessoa pode entrar com GitHub e aguardar aprovação. O catálogo é público; IA e execuções remotas ficam restritas aos participantes aprovados.</p></header>
    <form className="beta-invite" onSubmit={event => { event.preventDefault(); void change({ action: "invite", githubHandle: handle }); }}>
      <div className="field"><label htmlFor="beta-github">Pré-aprovar uma conta do GitHub</label><input id="beta-github" className="input" value={handle} onChange={event => setHandle(event.target.value)} maxLength={40} placeholder="@nome-de-usuario" required disabled={busy} /><p className="muted">A identidade é conferida no GitHub e vinculada ao login. Apenas administradores podem convidar.</p></div>
      <button className="button" disabled={busy || !handle.trim()}>Pré-aprovar conta</button>
    </form>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <div className="notice danger-text" role="alert"><p>{error}</p><button className="button" type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>Atualizar participantes</button></div>}
    <div className="beta-list-heading"><div className="field"><label htmlFor="beta-filter">Mostrar participantes</label><select id="beta-filter" className="select" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">Lista de espera</option><option value="approved">Aprovados</option><option value="rejected">Recusados</option><option value="revoked">Revogados</option><option value="all">Todos</option></select></div><span className="muted" role="status">{data ? `${people?.length ?? 0} participante(s)` : "Carregando participantes…"}</span></div>
    {people?.length === 0 && <p className="empty">Nenhuma pessoa neste filtro.</p>}
    <ul className="beta-participants">
      {people?.map(person => <li key={person.userId}><div><strong>{person.githubHandle ? `@${person.githubHandle}` : "Identidade GitHub não confirmada"}</strong><span className="muted">{person.githubId ? `GitHub verificado · ID ${person.githubId}` : "A aprovação exige uma identidade do GitHub vinculada."}</span><span className="muted">Nome no perfil: @{person.handle}</span><span className="muted">{person.role === "admin" ? "Administrador · acesso permanente" : labels[person.state]}</span><span className="muted">Entrada em {new Date(person.requestedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>{person.role !== "admin" && <div className="studio-inline-actions">{person.state !== "approved" && <button className="button" disabled={busy || !person.githubId} onClick={() => setDecision({ person, action: "approve" })}>Aprovar @{person.githubHandle ?? person.handle}</button>}{person.state === "pending" && <button className="button" disabled={busy} onClick={() => setDecision({ person, action: "reject" })}>Recusar @{person.githubHandle ?? person.handle}</button>}{person.state === "approved" && <button className="button" disabled={busy} onClick={() => setDecision({ person, action: "revoke" })}>Revogar @{person.githubHandle ?? person.handle}</button>}</div>}</li>)}
    </ul>
    {decision && <section className="notice beta-decision" aria-label="Confirmar alteração de acesso"><strong>{decision.action === "approve" ? "Liberar" : decision.action === "reject" ? "Recusar" : "Revogar"} o acesso de @{decision.person.githubHandle ?? decision.person.handle}?</strong><p>{decision.action === "approve" ? "A pessoa poderá usar as funções liberadas no beta, respeitando as cotas e a capacidade disponível." : "A pessoa continuará podendo entrar e consultar o catálogo. Novos pedidos de IA e execuções remotas serão bloqueados."}</p><div className="studio-inline-actions"><button className="button primary" disabled={busy} onClick={() => void change({ action: decision.action, userId: decision.person.userId })}>Confirmar decisão</button><button className="button" disabled={busy} onClick={() => setDecision(undefined)}>Voltar</button></div></section>}
    {Boolean(data?.invitations.length) && <details><summary>Contas pré-aprovadas ({data?.invitations.length})</summary><ul className="beta-invitations">{data?.invitations.map(invitation => <li key={invitation.githubId}><strong>@{invitation.githubHandle}</strong><span className="muted">GitHub ID {invitation.githubId} · Pré-aprovação vinculada a esta identidade</span><div><button className="button" type="button" disabled={busy} onClick={() => void change({ action: "revoke_invite", githubId: invitation.githubId })}>Remover pré-aprovação de @{invitation.githubHandle}</button></div></li>)}</ul></details>}
  </section>;
}
