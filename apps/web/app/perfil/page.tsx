import Link from "next/link";
import { ProfileOverview } from "@/components/profile-overview";
import { getOptionalActor } from "@/lib/actor";
import "./profile.css";

export const metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const actor = await getOptionalActor();
  if (!actor) return <main className="container page profile-page">
    <section className="profile-panel profile-signed-out">
      <span className="eyebrow">Sua conta</span>
      <h1>Seu espaço de prática</h1>
      <p>Entre para acompanhar sua atividade e gerenciar o acesso pelo terminal.</p>
      <Link className="button primary" href="/entrar">Entrar na conta</Link>
    </section>
  </main>;
  return <ProfileOverview actor={actor} />;
}
