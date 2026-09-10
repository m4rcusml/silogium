import { conversationCursor, conversationPageInput, type Conversation, type ConversationPageInput, type ConversationRepository, type ConversationTurn } from "@silogium/authoring";
import type { Actor } from "@silogium/core";
import { createSupabaseAdminClient } from "./admin";

type DbError = { message?: string; code?: string } | null;
function failure(error: DbError): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("Aplique a migração 202609090005_conversations.sql para habilitar o histórico do Studio.");
  throw new Error(`Não foi possível acessar o histórico do Studio${error?.message ? `: ${error.message}` : "."}`);
}
const conversationFromRow = (row: Record<string, unknown>): Conversation => ({ id: String(row.id), actorId: String(row.user_id), title: String(row.title), createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const turnFromRow = (row: Record<string, unknown>): ConversationTurn => ({
  id: String(row.id), actorId: String(row.user_id), conversationId: String(row.conversation_id), jobId: String(row.job_id),
  mode: row.mode as ConversationTurn["mode"], userText: String(row.user_text), assistantText: String(row.assistant_text),
  status: row.status as ConversationTurn["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

export class SupabaseConversationRepository implements ConversationRepository {
  private client() {
    const client = createSupabaseAdminClient();
    if (!client) throw new Error("Supabase de servidor não configurado.");
    return client;
  }
  async create(actor: Actor, title: string): Promise<Conversation> {
    const { data, error } = await this.client().from("authoring_conversations").insert({ id: crypto.randomUUID(), user_id: actor.id, title: title.trim().slice(0, 120) || "Nova conversa" }).select("*").single();
    if (error) failure(error);
    return conversationFromRow(data);
  }
  async get(id: string, actor: Actor): Promise<Conversation | null> {
    const { data, error } = await this.client().from("authoring_conversations").select("*").eq("id", id).eq("user_id", actor.id).maybeSingle();
    if (error) failure(error);
    return data ? conversationFromRow(data) : null;
  }
  async list(actor: Actor, input: ConversationPageInput = {}) {
    const { limit, cursor } = conversationPageInput(input);
    let query = this.client().from("authoring_conversations").select("*").eq("user_id", actor.id).order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = query.or(`updated_at.lt.${cursor.at},and(updated_at.eq.${cursor.at},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) failure(error);
    const rows = (data ?? []).map(conversationFromRow);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, ...(rows.length > limit && last ? { nextCursor: conversationCursor(last.updatedAt, last.id) } : {}) };
  }
  async listTurns(id: string, actor: Actor, input: ConversationPageInput = {}) {
    if (!await this.get(id, actor)) throw new Error("Conversa não encontrada.");
    const { limit, cursor } = conversationPageInput(input);
    let query = this.client().from("authoring_conversation_turns").select("*").eq("conversation_id", id).eq("user_id", actor.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) failure(error);
    const rows = (data ?? []).map(turnFromRow);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, ...(rows.length > limit && last ? { nextCursor: conversationCursor(last.createdAt, last.id) } : {}) };
  }
  async saveTurn(turn: ConversationTurn, actor: Actor): Promise<void> {
    const conversation = await this.get(turn.conversationId, actor);
    if (!conversation) return;
    if (turn.actorId !== actor.id) throw new Error("Conversa não encontrada.");
    const { data: previous, error: readError } = await this.client().from("authoring_conversation_turns").select("user_id,conversation_id,job_id").eq("id", turn.id).maybeSingle();
    if (readError) failure(readError);
    if (previous && (previous.user_id !== actor.id || previous.conversation_id !== turn.conversationId || previous.job_id !== turn.jobId)) throw new Error("Mensagem inválida.");
    const { error } = await this.client().from("authoring_conversation_turns").upsert({
      id: turn.id, user_id: actor.id, conversation_id: turn.conversationId, job_id: turn.jobId,
      mode: turn.mode, user_text: turn.userText.slice(0, 2_000), assistant_text: turn.assistantText.slice(0, 700),
      status: turn.status, created_at: turn.createdAt, updated_at: turn.updatedAt
    });
    if (error?.code === "23503") return; // Deleted while a background job was finishing.
    if (error) failure(error);
  }
  async delete(id: string, actor: Actor): Promise<void> {
    const { data, error } = await this.client().from("authoring_conversations").delete().eq("id", id).eq("user_id", actor.id).select("id");
    if (error) failure(error);
    if (!data?.length) throw new Error("Conversa não encontrada.");
  }
}
