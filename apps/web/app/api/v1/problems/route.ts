import { searchCatalog } from "@silogium/core";
import { getAuthoringRepository } from "@/lib/authoring";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const problems = searchCatalog(await getAuthoringRepository().listCatalog(), {
    query: url.searchParams.get("query") ?? undefined,
    runtime: (url.searchParams.get("runtime") as "typescript" | "python" | null) ?? undefined,
    difficulty: (url.searchParams.get("difficulty") as "easy" | "medium" | "hard" | null) ?? undefined,
    format: (url.searchParams.get("format") as "classic" | "progressive" | null) ?? undefined
  });
  return Response.json({ problems });
}
