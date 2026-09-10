import { RuntimeSchema, SolutionSnapshotSchema } from "@silogium/core";
import { getActor } from "@/lib/actor";
import { readSolutionDraft, saveSolutionDraft } from "@/lib/solution-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function identity(input: Record<string, unknown>) {
  if (typeof input.problemId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.problemId) || !Number.isSafeInteger(Number(input.version)) || Number(input.version) < 1) throw new Error("Questão ou versão inválida.");
  return { problemId: input.problemId, version: Number(input.version), runtime: RuntimeSchema.parse(input.runtime), accessKey: typeof input.accessKey === "string" ? input.accessKey.slice(0,512) : undefined };
}
export async function GET(request: Request) {
  try {
    const actor = await getActor(request); const input = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json({ draft: await readSolutionDraft(actor, identity(input)), mode: createSupabaseAdminClient() ? "persistent" : "demo" }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Rascunho indisponível." }, { status: 403 }); }
}
export async function PUT(request: Request) {
  try {
    const actor = await getActor(request); const input = await request.json();
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Revisão inválida.");
    return Response.json({ draft: await saveSolutionDraft(actor, identity(input), input.expectedRevision, SolutionSnapshotSchema.parse(input.snapshot)), mode: createSupabaseAdminClient() ? "persistent" : "demo" });
  } catch (error) { const message = error instanceof Error ? error.message : "Não foi possível salvar."; return Response.json({ error: message }, { status: message.startsWith("CONFLICT:") ? 409 : 400 }); }
}
