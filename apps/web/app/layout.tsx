import type { Metadata } from "next";
import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { getOptionalActor } from "@/lib/actor";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Silogium", template: "%s · Silogium" },
  description: "Encontre, resolva e submeta questões de programação."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await getOptionalActor();
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <nav className="container nav" aria-label="Navegação principal">
            <Link href="/" className="brand"><span className="brand-mark">S</span>Silogium</Link>
            <div className="nav-links">
              <Link href="/explorar">Explorar</Link>
              <Link href="/assistente">Assistente</Link>
              <Link href="/minhas-questoes">Minhas questões</Link>
              <Link href="/submissoes">Submissões</Link>
              {actor?.role === "admin" && <Link href="/admin/revisao">Revisão</Link>}
            </div>
            <span className="nav-spacer" />
            <Link href={actor ? "/perfil" : "/entrar"} className="button ghost" aria-label="Abrir perfil"><CircleUserRound size={18} /> {actor ? `@${actor.handle}` : "Entrar"}</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
