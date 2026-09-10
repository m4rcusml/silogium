import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function safeDestination(next: string, origin: string): URL {
  const fallback = new URL("/explorar", origin);
  // URL parsing normalizes backslashes and strips some control characters.
  // Reject them before parsing, then verify the canonical destination as well.
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const destination = new URL(next, origin);
    return destination.origin === origin && !destination.username && !destination.password ? destination : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/explorar";
  const supabase = await createSupabaseServerClient();
  if (code && supabase) await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(safeDestination(next, url.origin));
}
