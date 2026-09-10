import type { SaveEditorialDraft } from "@silogium/authoring";
import { getActor } from "@/lib/actor";
import { editorialError, getEditorial, readEditorialBody } from "./service";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await getActor(request);
    const { slug } = await params;
    const revealSpoilers = new URL(request.url).searchParams.get("revealSpoilers") === "true";
    return Response.json(await getEditorial().open(slug, actor, { revealSpoilers }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return editorialError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await getActor(request);
    const { slug } = await params;
    const body = await readEditorialBody(request);
    return Response.json(await getEditorial().saveDraft(slug, actor, body as SaveEditorialDraft), { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return editorialError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await getActor(request);
    const { slug } = await params;
    const body = await readEditorialBody(request);
    if (body.action === "validate") return Response.json(await getEditorial().validateDraft(slug, actor, body.expectedRevision as number), { headers: { "cache-control": "private, no-store" } });
    if (body.action === "publication") return Response.json(await getEditorial().submitPublication(slug, actor, body.expectedRevision as number, body.licensesAccepted === true), { headers: { "cache-control": "private, no-store" } });
    throw new Error("Ação editorial inválida.");
  } catch (error) { return editorialError(error); }
}
