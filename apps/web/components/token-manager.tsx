"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";

type Token = { id: string; prefix: string; created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null };

export function TokenManager() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [secret, setSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const load = () => fetch("/api/v1/tokens").then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os tokens.");
    setTokens(body.tokens ?? []);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : "Falha inesperada."));
  useEffect(() => { void load(); }, []);
  async function create() {
    setError(undefined);
    const response = await fetch("/api/v1/tokens", { method: "POST" });
    const body = await response.json();
    if (!response.ok) return setError(body.error ?? "Não foi possível criar o token.");
    setSecret(body.token);
    await load();
  }
  async function revoke(id: string) {
    await fetch("/api/v1/tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    await load();
  }
  return <section className="card">
    <span className="eyebrow">CLI</span><h2>Tokens de acesso</h2><p className="muted">Crie um token, copie-o uma vez e execute <code>silogium auth &lt;token&gt;</code>.</p>
    <button className="button primary" type="button" onClick={create}><KeyRound size={16} /> Criar token</button>
    {secret && <div className="empty" style={{ marginTop: 18 }}><strong>Copie agora; o segredo não será exibido novamente.</strong><code>{secret}</code><button className="button" type="button" onClick={() => navigator.clipboard.writeText(secret)}><Copy size={15} /> Copiar</button></div>}
    {error && <p className="danger-text">{error}</p>}
    <div className="result-list">{tokens.map((token) => <div className="case-result" key={token.id}><span><code>{token.prefix}…</code> · expira em {new Date(token.expires_at).toLocaleDateString("pt-BR")}{token.revoked_at ? " · revogado" : ""}</span>{!token.revoked_at && <button className="button" type="button" onClick={() => revoke(token.id)}><Trash2 size={14} /> Revogar</button>}</div>)}</div>
  </section>;
}
