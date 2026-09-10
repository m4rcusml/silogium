"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, RotateCw, TerminalSquare, Trash2 } from "lucide-react";

type Token = { id: string; prefix: string; created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null };

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error ?? fallback);
  return body as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : "Não informado";
}

export function TokenManager({ localMode = false }: { localMode?: boolean }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [secret, setSecret] = useState<{ token: string; id: string }>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [confirmation, setConfirmation] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const mutationInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setLoadError(undefined);
    void fetch("/api/v1/tokens", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await readResponse<{ tokens: Token[] }>(response, "Não foi possível carregar os tokens.");
      if (!Array.isArray(body.tokens)) throw new Error("A lista de tokens retornou uma resposta inválida.");
      if (controller.signal.aborted) return;
      setTokens(body.tokens);
      setNow(Date.now());
      setState("ready");
    }).catch((reason) => {
      if (controller.signal.aborted) return;
      setLoadError(reason instanceof Error ? reason.message : "Não foi possível carregar os tokens.");
      setState("error");
    });
    return () => controller.abort();
  }, [revision]);

  async function create() {
    if (mutationInFlight.current || secret || state !== "ready") return;
    mutationInFlight.current = true;
    setPending("create");
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await fetch("/api/v1/tokens", { method: "POST" });
      const body = await readResponse<{ token: string; id: string; prefix: string; createdAt: string; expiresAt: string }>(response, "Não foi possível confirmar a criação. Atualize a lista antes de tentar novamente.");
      if (!body.token || !body.id || !body.prefix) throw new Error("A criação retornou uma resposta incompleta. Atualize a lista antes de tentar novamente.");
      setSecret({ token: body.token, id: body.id });
      setCopied(false);
      setTokens((current) => [{ id: body.id, prefix: body.prefix, created_at: body.createdAt, expires_at: body.expiresAt, revoked_at: null, last_used_at: null }, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível confirmar a criação. Atualize a lista antes de tentar novamente.");
    } finally {
      mutationInFlight.current = false;
      setPending(undefined);
    }
  }

  async function revoke(id: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setPending(id);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await fetch("/api/v1/tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) await readResponse(response, "Não foi possível revogar o token. Atualize a lista antes de tentar novamente.");
      setTokens((current) => current.map((token) => token.id === id ? { ...token, revoked_at: new Date().toISOString() } : token));
      if (secret?.id === id) setSecret(undefined);
      setConfirmation(undefined);
      setNotice("Token revogado. O acesso por ele foi encerrado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível revogar o token.");
    } finally {
      mutationInFlight.current = false;
      setPending(undefined);
    }
  }

  async function copySecret() {
    if (!secret) return;
    setError(undefined);
    try {
      await navigator.clipboard.writeText(secret.token);
      setCopied(true);
    } catch {
      setError("O navegador não permitiu copiar. Selecione o token acima e copie manualmente.");
    }
  }

  return <section id="terminal-access" className="profile-panel token-manager" aria-labelledby="token-manager-title">
    <div className="profile-section-heading"><div><span className="eyebrow">Acesso pelo terminal</span><h2 id="token-manager-title">Tokens de acesso</h2><p>Conecte sua CLI sem compartilhar a sessão do navegador.</p></div><TerminalSquare size={21} className="muted" aria-hidden="true" /></div>
    <div className="token-layout">
      <div className="token-main">
        <div className="token-toolbar"><button className="button primary" type="button" disabled={Boolean(pending || secret) || state !== "ready"} onClick={() => void create()}><KeyRound size={16} aria-hidden="true" />{pending === "create" ? "Criando…" : "Criar token"}</button><button className="button ghost" type="button" disabled={Boolean(pending) || state === "loading"} onClick={() => { setConfirmation(undefined); setRevision((value) => value + 1); }} aria-label="Atualizar tokens"><RotateCw size={14} aria-hidden="true" /> Atualizar</button></div>
        {secret && <div className="token-secret" role="region" aria-label="Novo token de acesso"><strong>Copie agora; este token só aparece uma vez.</strong><p>Guarde-o em um lugar seguro. Não o coloque em código ou repositórios.</p><code className="token-secret-value">{secret.token}</code><div className="token-actions"><button className="button" type="button" onClick={() => void copySecret()}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? "Token copiado" : "Copiar token"}</button><button className="button ghost" type="button" onClick={() => { setSecret(undefined); setCopied(false); }}>Já guardei</button></div><span className="sr-only" role="status">{copied ? "Token copiado para a área de transferência." : "Token criado. Copie antes de sair desta página."}</span></div>}
        {error && <p className="token-message danger-text" role="alert">{error}</p>}
        {notice && <p className="token-message" role="status">{notice}</p>}
        {state === "loading" && <p className="profile-state" role="status">Carregando tokens…</p>}
        {state === "error" && <div className="profile-state" role="alert"><p>{loadError}</p><button className="button" type="button" onClick={() => setRevision((value) => value + 1)}>Tentar carregar tokens novamente</button></div>}
        {state === "ready" && (tokens.length === 0 ? <div className="profile-state"><KeyRound size={21} aria-hidden="true" /><strong>Nenhum token criado</strong><p>Você só precisa de um token para usar a CLI. No site, sua sessão já autentica os envios.</p></div> : <div className="token-list">{tokens.map((token) => {
          const status = token.revoked_at ? "Revogado" : new Date(token.expires_at).getTime() <= now ? "Expirado" : "Ativo";
          return <article className="token-item" key={token.id} aria-label={`Token ${token.prefix}`}>
            <div className="token-item-heading"><code>{token.prefix}…</code><span className={`token-status ${status === "Ativo" ? "active" : ""}`}>{status}</span>{status === "Ativo" && <button className="button ghost" type="button" disabled={Boolean(pending)} aria-label={`Revogar token ${token.prefix}`} aria-expanded={confirmation === token.id} aria-controls={`revoke-${token.id}`} onClick={() => { setConfirmation(confirmation === token.id ? undefined : token.id); setError(undefined); }}><Trash2 size={14} aria-hidden="true" /> Revogar</button>}</div>
            <dl className="token-dates"><div><dt>Criado</dt><dd>{formatDate(token.created_at)}</dd></div><div><dt>Expira</dt><dd>{formatDate(token.expires_at)}</dd></div><div><dt>Último uso</dt><dd>{token.last_used_at ? formatDate(token.last_used_at) : "Não registrado"}</dd></div></dl>
            {confirmation === token.id && <div id={`revoke-${token.id}`} className="token-confirmation"><p>Revogar este token encerra o acesso das CLIs conectadas com ele. Para reconectar, será necessário outro token.</p><div className="token-actions"><button className="button token-revoke" type="button" disabled={Boolean(pending)} onClick={() => void revoke(token.id)}>{pending === token.id ? "Revogando…" : "Revogar acesso"}</button><button className="button ghost" type="button" disabled={Boolean(pending)} onClick={() => setConfirmation(undefined)}>Cancelar</button></div></div>}
          </article>;
        })}</div>)}
      </div>
      <aside className="token-guide" aria-label="Como usar o terminal"><h3>Do editor ao terminal</h3><ol><li><strong>Autentique a CLI</strong><code>silogium auth &lt;token&gt;</code></li><li><strong>Baixe uma questão</strong><code>silogium pull &lt;slug&gt; --runtime ts</code><p>Use <code>py</code> para Python. O slug aparece na URL da questão.</p></li><li><strong>Teste e submeta</strong><code>silogium test</code><code>silogium submit</code></li></ol><p className="profile-caption">Tokens expiram em 90 dias e podem ser revogados a qualquer momento.{localMode ? " No modo local, o último uso não é registrado." : ""}</p></aside>
    </div>
  </section>;
}
