"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PersonalProfile } from "@silogium/core";
import { usePersonalWorkspace } from "./use-personal-workspace";

export function PersonalProfileSettings() {
  const workspace = usePersonalWorkspace();
  const [profile, setProfile] = useState<PersonalProfile>({ displayName: "", bio: "", website: "", shared: false });
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (workspace.data && !editing) setProfile(workspace.data.state.profile); }, [workspace.data, editing]);
  function edit(change: Partial<PersonalProfile>) { setEditing(true); setSaved(false); setProfile({ ...profile, ...change }); }
  return <section className="personal-panel" aria-labelledby="personal-profile-title"><h2 id="personal-profile-title">Seu perfil</h2>
    <p className="muted">Compartilhe somente sua apresentação. Código, prompts, histórico e biblioteca continuam privados.</p>
    {workspace.error && <p role="alert">{workspace.error} <button className="button ghost" onClick={() => void workspace.refresh()}>Recarregar</button></p>}
    <form className="personal-form" onSubmit={async (event) => { event.preventDefault(); if (await workspace.mutate({ kind: "profile", profile })) { setSaved(true); setEditing(false); } }}>
      <label className="field">Nome de exibição<input className="input" maxLength={80} required value={profile.displayName} onChange={(event) => edit({ displayName: event.target.value })} /></label>
      <label className="field">Apresentação<textarea className="textarea" maxLength={600} value={profile.bio} onChange={(event) => edit({ bio: event.target.value })} /></label>
      <label className="field">Site pessoal (HTTPS)<input className="input" type="url" maxLength={300} placeholder="https://" value={profile.website} onChange={(event) => edit({ website: event.target.value })} /></label>
      <label className="personal-check"><input type="checkbox" checked={profile.shared} onChange={(event) => edit({ shared: event.target.checked })} /><span>Compartilhar somente meu nome, apresentação e site por link público.</span></label>
      <div className="personal-actions"><button className="button primary" disabled={workspace.busy || !workspace.data}>Salvar perfil</button>{workspace.data?.state.profile.shared && <Link className="button" href={`/p/${encodeURIComponent(workspace.data.handle)}`}>Ver perfil compartilhado</Link>}</div>
      {saved && <p role="status">Perfil salvo.{!profile.shared ? " O link público está desativado." : ""}</p>}
      {workspace.data?.mode === "demo" && <p className="muted">Modo local: dados desta sessão do servidor, sem persistência garantida após reinício.</p>}
    </form>
  </section>;
}
