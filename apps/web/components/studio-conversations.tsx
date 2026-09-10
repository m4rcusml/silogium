"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, ConversationPage, ConversationTurn } from "@silogium/authoring";
import { readStudioResponse, studioError } from "./studio-request";

export function StudioConversations({ actorId, selectedId, refreshKey, disabled, onSelect, onOpenJob }: {
  actorId?: string; selectedId?: string; refreshKey?: string; disabled: boolean;
  onSelect(id?: string): void; onOpenJob(turn: ConversationTurn): void;
}) {
  const [conversations, setConversations] = useState<ConversationPage<Conversation>>({ items: [] });
  const [turns, setTurns] = useState<ConversationPage<ConversationTurn>>({ items: [] });
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);
  const identity = useRef({ actorId, selectedId });
  identity.current = { actorId, selectedId };

  useEffect(() => {
    let active = true;
    setConversations({ items: [] });
    setError(undefined);
    if (actorId) void fetch("/api/v1/conversations", { cache: "no-store" }).then((response) => readStudioResponse<ConversationPage<Conversation>>(response, "Não foi possível carregar o histórico")).then((value) => { if (active) setConversations(value); }).catch((caught) => { if (active) setError(studioError(caught)); });
    return () => { active = false; };
  }, [actorId, refreshKey, revision]);

  useEffect(() => {
    let active = true;
    setTurns({ items: [] });
    setConfirmDelete(false);
    if (actorId && selectedId) void fetch(`/api/v1/conversations/${encodeURIComponent(selectedId)}`, { cache: "no-store" }).then((response) => readStudioResponse<ConversationPage<ConversationTurn>>(response, "Não foi possível carregar a conversa")).then((value) => { if (active) setTurns(value); }).catch((caught) => { if (active) setError(studioError(caught)); });
    return () => { active = false; };
  }, [actorId, selectedId, refreshKey, revision]);

  async function more(kind: "conversations" | "turns") {
    const identityAtStart = identity.current;
    const cursor = kind === "turns" ? turns.nextCursor : conversations.nextCursor;
    if (!cursor) return;
    try {
      const url = kind === "turns" ? `/api/v1/conversations/${encodeURIComponent(selectedId!)}` : "/api/v1/conversations";
      const response = await fetch(`${url}?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (kind === "turns") { const value = await readStudioResponse<ConversationPage<ConversationTurn>>(response, "Não foi possível carregar mais mensagens"); if (identity.current.actorId === identityAtStart.actorId && identity.current.selectedId === identityAtStart.selectedId) setTurns((current) => ({ ...value, items: [...new Map([...current.items, ...value.items].map((item) => [item.id, item])).values()] })); }
      else { const value = await readStudioResponse<ConversationPage<Conversation>>(response, "Não foi possível carregar mais conversas"); if (identity.current.actorId === identityAtStart.actorId) setConversations((current) => ({ ...value, items: [...new Map([...current.items, ...value.items].map((item) => [item.id, item])).values()] })); }
    } catch (caught) { setError(studioError(caught)); }
  }

  async function remove() {
    if (!selectedId || deleting) return;
    const deletedId = selectedId;
    const actorAtStart = actorId;
    setDeleting(true);
    try {
      const response = await fetch(`/api/v1/conversations/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      if (!response.ok) await readStudioResponse(response, "Não foi possível excluir a conversa");
      if (identity.current.actorId === actorAtStart) {
        if (identity.current.selectedId === deletedId) onSelect(undefined);
        setRevision((value) => value + 1);
      }
    } catch (caught) { setError(studioError(caught)); }
    finally { setDeleting(false); }
  }

  if (!actorId) return null;
  return <section className="studio-conversations" aria-label="Histórico do assistente">
    <div className="studio-inline-actions"><h2>Histórico de pedidos</h2>{selectedId && <button type="button" className="button" disabled={disabled} onClick={() => onSelect(undefined)}>Nova conversa</button>}</div>
    <p className="muted">Retome uma conversa ou consulte o resultado de um pedido. As questões criadas ficam em Minhas questões.</p>
    {error && <p className="danger-text" role="alert">{error}</p>}
    <details><summary>Conversas anteriores ({conversations.items.length})</summary>
      <button type="button" className="button" onClick={() => setRevision((value) => value + 1)}>Atualizar histórico</button>
      <div className="conversation-list">{conversations.items.map((conversation) => <button type="button" key={conversation.id} aria-pressed={selectedId === conversation.id} disabled={disabled} onClick={() => onSelect(conversation.id)}><span>{conversation.title}</span><time>{new Date(conversation.updatedAt).toLocaleDateString("pt-BR")}</time></button>)}</div>
      {!conversations.items.length && <p className="muted">Seus pedidos aparecerão aqui depois do primeiro envio.</p>}
      {conversations.nextCursor && <button type="button" className="button" onClick={() => void more("conversations")}>Mais conversas</button>}
    </details>
    {selectedId && <>
      <div className="conversation-turns">{[...turns.items].reverse().map((turn) => <article key={turn.id}><p><strong>Você</strong> · {turn.userText}</p><p>{turn.assistantText}</p><button type="button" className="button" disabled={disabled} onClick={() => onOpenJob(turn)}>Ver pedido</button></article>)}</div>
      {turns.nextCursor && <button type="button" className="button" onClick={() => void more("turns")}>Mensagens anteriores</button>}
      <div className="studio-inline-actions">{confirmDelete ? <><p>Excluir somente o histórico? Questões e pedidos em execução serão mantidos.</p><button type="button" className="button" disabled={deleting} onClick={() => void remove()}>Confirmar exclusão</button><button type="button" className="button" onClick={() => setConfirmDelete(false)}>Cancelar</button></> : <button type="button" className="button" onClick={() => setConfirmDelete(true)}>Excluir conversa</button>}</div>
    </>}
  </section>;
}
