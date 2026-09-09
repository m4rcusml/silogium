"use client";

import { Github } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

export function GitHubLogin() {
  const client = createSupabaseBrowserClient();
  async function login() {
    if (!client) return;
    await client.auth.signInWithOAuth({ provider: "github", options: { redirectTo: `${location.origin}/auth/callback` } });
  }
  return <button className="button primary" type="button" onClick={login} disabled={!client}><Github size={17} />{client ? "Entrar com GitHub" : "Configure o Supabase para entrar"}</button>;
}
