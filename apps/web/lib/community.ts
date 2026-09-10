import "server-only";
import { CommunityPostSchema, type Actor, type CommunityPost } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getAuthoringRepository } from "./authoring";

type Report = { postId: string; actorId: string; reason: string; createdAt: string };
const scope = globalThis as typeof globalThis & { __silogiumCommunityPosts?: Map<string, CommunityPost>; __silogiumCommunityReports?: Map<string, Report>; __silogiumCommunityWrites?: Map<string, number[]> };
const posts = scope.__silogiumCommunityPosts ??= new Map<string, CommunityPost>();
const reports = scope.__silogiumCommunityReports ??= new Map<string, Report>();
const writes = scope.__silogiumCommunityWrites ??= new Map<string, number[]>();

async function publicProblem(problemId: string, version?: number) {
  const repository = getAuthoringRepository();
  const current = (await repository.listCatalog()).find((problem) => problem.id === problemId);
  if (!current) throw new Error("Comunidade disponível somente para questões públicas do catálogo.");
  if (version !== undefined && current.version !== version) {
    const historical = await repository.getPackageVersion(problemId, version);
    if (!historical || historical.problem.status !== "published") throw new Error("Versão pública não encontrada.");
    return historical.problem;
  }
  return current;
}

async function allPosts(problemId?: string): Promise<CommunityPost[]> {
  const admin = createSupabaseAdminClient();
  if (!admin) return [...posts.values()].filter((post) => !problemId || post.problemId === problemId).map((post) => structuredClone(post));
  const result: CommunityPost[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = admin.from("community_posts").select("content").order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (problemId) query = query.eq("problem_id", problemId);
    const { data, error } = await query;
    if (error) throw new Error("Não foi possível ler as contribuições. Verifique a migração da comunidade.");
    result.push(...(data ?? []).map((row) => row.content as CommunityPost));
    if (!data || data.length < 500) return result;
  }
}

export async function listCommunity(problemId: string, version: number, actor?: Actor) {
  await publicProblem(problemId, version);
  return (await allPosts(problemId)).filter((post) => post.problemVersion === version && post.status !== "removed"
    && (post.status === "approved" || post.authorId === actor?.id || actor?.role === "admin"))
    .map(({ authorId, reason, ...post }) => ({ ...post, ...(authorId === actor?.id || actor?.role === "admin" ? { reason } : {}), mine: authorId === actor?.id }));
}

async function writePost(post: CommunityPost, actor: Actor, expectedUpdatedAt?: string) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc("save_community_post_for", { requested_user: actor.id, post: post, expected_updated_at: expectedUpdatedAt ?? null });
    if (error) throw new Error("Não foi possível salvar. Aguarde um minuto antes de tentar novamente.");
    if (data !== true) throw new Error("CONFLICT: A contribuição mudou. Recarregue e revise o texto atual antes de salvar.");
  } else {
    if (expectedUpdatedAt && posts.get(post.id)?.updatedAt !== expectedUpdatedAt) throw new Error("CONFLICT: A contribuição mudou. Recarregue e revise o texto atual antes de salvar.");
    const recent = (writes.get(actor.id) ?? []).filter((time) => time > Date.now() - 60_000);
    if (recent.length >= 5 && actor.role !== "admin") throw new Error("Limite de 5 contribuições por minuto. Aguarde antes de tentar novamente.");
    writes.set(actor.id, [...recent, Date.now()]); posts.set(post.id, structuredClone(post));
  }
}

function assertObservedRevision(post: CommunityPost, expectedUpdatedAt: unknown) {
  if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt !== post.updatedAt) {
    throw new Error("CONFLICT: A contribuição mudou ou sua revisão não foi informada. Recarregue e revise o texto atual antes de salvar.");
  }
}

export async function contribute(problemId: string, version: number, actor: Actor, input: unknown, existingId?: string, expectedUpdatedAt?: string) {
  await publicProblem(problemId, version);
  const content = CommunityPostSchema.parse(input);
  const existing = existingId ? (await allPosts(problemId)).find((post) => post.id === existingId && post.problemVersion === version) : undefined;
  if (existingId && (!existing || existing.authorId !== actor.id || existing.status === "removed")) throw new Error("Contribuição não encontrada para sua conta.");
  if (existing) assertObservedRevision(existing, expectedUpdatedAt);
  const now = new Date(Math.max(Date.now(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString();
  const post: CommunityPost = { ...content, id: existing?.id ?? crypto.randomUUID(), problemId, problemVersion: version, authorId: actor.id, authorHandle: actor.handle, status: "pending", createdAt: existing?.createdAt ?? now, updatedAt: now };
  await writePost(post, actor, existing?.updatedAt);
  return { id: post.id, status: post.status, updatedAt: post.updatedAt };
}

export async function moderateContribution(postId: string, actor: Actor, decision: "approve" | "reject" | "remove", reason: string, expectedUpdatedAt: string, scope?: { problemId: string; version: number }) {
  const admin = createSupabaseAdminClient();
  const post = admin ? (await admin.from("community_posts").select("content").eq("id", postId).maybeSingle()).data?.content as CommunityPost | undefined : posts.get(postId);
  if (!post) throw new Error("Contribuição não encontrada.");
  if (scope && (post.problemId !== scope.problemId || post.problemVersion !== scope.version)) throw new Error("Contribuição não encontrada nesta versão.");
  if (post.status === "removed") throw new Error("Contribuições removidas não podem ser publicadas ou alteradas.");
  if (!(decision === "remove" && post.authorId === actor.id) && actor.role !== "admin") throw new Error("Somente administradores podem revisar contribuições.");
  assertObservedRevision(post, expectedUpdatedAt);
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(post.updatedAt) + 1)).toISOString();
  if (decision === "remove" && post.authorId === actor.id) {
    const updated = { ...post, title: "Contribuição removida", body: "Conteúdo removido pelo autor.", status: "removed" as const, reason: undefined, updatedAt };
    await writePost(updated, actor, post.updatedAt); return;
  }
  if (decision !== "approve" && reason.trim().length < 5) throw new Error("Explique o motivo da decisão em pelo menos 5 caracteres.");
  if (decision === "approve") await publicProblem(post.problemId, post.problemVersion);
  await writePost({ ...post, status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "removed", reason: reason.trim().slice(0, 1000), updatedAt }, actor, post.updatedAt);
  // Persistent moderation clears reports in the same transaction as the decision.
  if (!admin) for (const [key, report] of reports) if (report.postId === postId) reports.delete(key);
}

export async function reportContribution(problemId: string, version: number, postId: string, actor: Actor, reason: string) {
  if (reason.trim().length < 5 || reason.length > 1000) throw new Error("Explique a denúncia em 5 a 1.000 caracteres.");
  const visible = await listCommunity(problemId, version, actor);
  if (!visible.some((post) => post.id === postId && post.status === "approved")) throw new Error("Contribuição pública não encontrada.");
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.from("community_reports").upsert({ post_id: postId, user_id: actor.id, reason: reason.trim(), created_at: new Date().toISOString() }, { onConflict: "post_id,user_id" });
    if (error) throw new Error("Não foi possível registrar a denúncia.");
  } else reports.set(`${actor.id}:${postId}`, { postId, actorId: actor.id, reason: reason.trim(), createdAt: new Date().toISOString() });
}

export async function communityReviewQueue(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Somente administradores podem revisar contribuições.");
  const admin = createSupabaseAdminClient();
  let complaints = [...reports.values()];
  if (admin) {
    complaints = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("community_reports").select("post_id,reason,created_at").order("created_at", { ascending: false }).order("post_id").order("user_id").range(offset, offset + 499);
      if (error) throw new Error("Não foi possível ler as denúncias.");
      complaints.push(...(data ?? []).map((row) => ({ postId: row.post_id, reason: row.reason, createdAt: row.created_at, actorId: "" })));
      if (!data || data.length < 500) break;
    }
  }
  return (await allPosts()).filter((post) => post.status !== "removed" && (post.status === "pending" || complaints.some((report) => report.postId === post.id)))
    .map((post) => ({ ...post, reports: complaints.filter((report) => report.postId === post.id).map(({ reason }) => ({ reason })) }));
}
