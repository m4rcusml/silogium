import Link from "next/link";
import type { StudioAccess } from "../lib/studio-access";
import { brasiliaResetLabel } from "../lib/studio-access";

export function StudioAccessNotice({ access, error, refreshing, onRefresh }: { access?: StudioAccess; error?: string; refreshing: boolean; onRefresh(): void }) {
  const beta = access?.beta;
  return <section className="studio-beta-notice" aria-label="Acesso e cota do beta">
    <div>
      <strong>{!access ? "Conferindo acesso ao beta" : !beta ? "O Studio está em beta fechado" : beta.state === "pending" ? "Você está na lista de espera" : beta.state === "rejected" ? "Pedido de acesso não aprovado" : beta.state === "revoked" ? "Seu acesso ao beta foi revogado" : beta.isAdmin ? "Acesso de administrador" : "Você faz parte do beta"}</strong>
      <p>{!access ? "Suas questões e o catálogo continuam disponíveis enquanto consultamos seu acesso." : !beta ? "Entre com GitHub para entrar na lista de espera. A aprovação é feita pela administração." : beta.state !== "approved" ? "Você pode explorar o catálogo. Criação com IA e testes remotos, inclusive pela CLI, precisam de acesso aprovado." : beta.isAdmin ? "Sem cota diária de criação. Os limites compartilhados do Groq e do judge continuam valendo." : <>{beta.remaining ?? 0} de {beta.dailyLimit ?? 2} criações disponíveis hoje. {beta.reservedToday > 0 ? `${beta.reservedToday} em andamento; a vaga fica reservada até a conclusão. ` : ""}Renova em {brasiliaResetLabel(beta.resetsAt)}.</>}</p>
      {error && <p className="danger-text" role="alert">{error}</p>}
    </div>
    <div className="studio-inline-actions">{access && !beta && <Link className="button" href="/entrar?next=%2Fstudio">Entrar com GitHub</Link>}<button className="button" type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? "Atualizando…" : "Atualizar acesso e saldo"}</button>{beta?.state !== "approved" && <Link href="/explorar">Explorar catálogo</Link>}</div>
  </section>;
}
