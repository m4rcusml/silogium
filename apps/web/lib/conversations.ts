import { memoryConversationRepository, type ConversationRepository } from "@silogium/authoring";
import { createSupabaseAdminClient } from "./supabase/admin";
import { SupabaseConversationRepository } from "./supabase/conversation-repository";

const store = globalThis as typeof globalThis & { __silogiumConversations?: ConversationRepository };
export function getConversationRepository(): ConversationRepository {
  if (!createSupabaseAdminClient()) return memoryConversationRepository;
  if (!(store.__silogiumConversations instanceof SupabaseConversationRepository)) store.__silogiumConversations = new SupabaseConversationRepository();
  return store.__silogiumConversations;
}
