import { ProblemEditorial, StructuralProblemValidator } from "@silogium/authoring";
import { getPlatformJudge } from "@/lib/platform-judge";
import { getAuthoringRepository } from "@/lib/authoring";

export function getEditorial() { return new ProblemEditorial(getAuthoringRepository(), new StructuralProblemValidator(getPlatformJudge())); }

export async function readEditorialBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new Error("Informe os dados do rascunho.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new Error("O pedido excede o limite de 2 MB."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato de pedido inválido.");
  return value as Record<string, unknown>;
}

export function editorialError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a edição.";
  return Response.json({ error: message }, { status: /mudou|outra aba|durante|já começou|já está sendo/.test(message) ? 409 : /não encontrada|não encontrado/.test(message) ? 404 : 400 });
}
