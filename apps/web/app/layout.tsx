import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleUserRound } from "lucide-react";
import { PrimaryNavigation } from "@/components/primary-navigation";
import { getOptionalActor } from "@/lib/actor";
import "./typography.css";
import "./globals.css";
import "./personal.css";

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
            <Link href="/" className="brand" aria-label="Silogium — início">
              <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" width="28" height="28" fill="none"><path d="M21 6H11L6 11L17 17L12 22H6M22 6V11M22 17L17 22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <span className="brand-wordmark">silogium</span>
            </Link>
            <span className="nav-divider" aria-hidden="true" />
            <PrimaryNavigation />
            <span className="nav-spacer" />
            <Link href={actor ? "/perfil" : "/entrar"} className="profile-link" aria-label={actor ? "Abrir perfil" : "Entrar na conta"} title={actor ? `@${actor.handle}` : "Entrar"}>
              <span className="profile-avatar" aria-hidden="true">{actor ? actor.handle.slice(0, 2).toUpperCase() : <CircleUserRound size={18} />}</span>
              <span className="profile-label">{actor ? `@${actor.handle}` : "Entrar"}</span><ChevronRight className="profile-chevron" size={14} aria-hidden="true" />
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
