"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BetaStatus } from "../lib/beta";
import { readStudioResponse } from "./studio-request";
import { brasiliaResetLabel } from "../lib/studio-access";

export function ProfileBetaNotice({ actorId }: { actorId: string }) {
  const [beta, setBeta] = useState<BetaStatus>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setBeta(undefined); setFailed(false);
    fetch("/api/v1/beta", { cache: "no-store", signal: controller.signal })
      .then(response => readStudioResponse<BetaStatus>(response, "Acesso indisponível"))
      .then(value => { if (active) setBeta(value); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [actorId]);
  return <section className="profile-panel profile-beta" aria-label="Seu acesso ao beta"><div><strong>{!beta ? failed ? "Não foi possível conferir o acesso ao beta" : "Conferindo seu acesso ao beta…" : beta.isAdmin ? "Administrador do beta" : beta.state === "approved" ? "Participação no beta aprovada" : beta.state === "pending" ? "Você está na lista de espera do beta" : beta.state === "revoked" ? "Seu acesso ao beta foi revogado" : "Seu pedido de acesso não foi aprovado"}</strong><p className="profile-caption">{!beta ? "Você pode consultar o estado atualizado no Studio." : beta.isAdmin ? "Você gerencia os participantes. A isenção de cota diária não ultrapassa os limites gratuitos compartilhados." : beta.state === "approved" ? `${beta.remaining ?? 0} de ${beta.dailyLimit ?? 2} criações disponíveis hoje. Renova em ${brasiliaResetLabel(beta.resetsAt)}. Veja também a capacidade de cada serviço no Studio.` : "O catálogo continua aberto. A administração precisa aprovar seu acesso para criar com IA e executar testes remotos, inclusive pela CLI."}</p></div><Link className="button" href={beta?.isAdmin ? "/admin/revisao" : "/studio"}>{beta?.isAdmin ? "Gerenciar beta" : "Consultar no Studio"}</Link></section>;
}
