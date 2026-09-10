import { notFound } from "next/navigation";
import { publicPersonalProfile } from "@/lib/personal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil compartilhado", robots: { index: false, follow: false } };
export default async function PublicProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (handle.length > 100) notFound();
  const profile = await publicPersonalProfile(handle);
  if (!profile) notFound();
  return <main className="container page"><span className="eyebrow">Perfil compartilhado</span><h1>{profile.displayName}</h1><p className="muted">@{profile.handle}</p><p className="public-profile-bio">{profile.bio}</p>{profile.website && <a href={profile.website} rel="noreferrer" target="_blank">Site pessoal</a>}<p className="muted">Somente os campos escolhidos pela pessoa são compartilhados. Atividade, código e questões privadas não são públicos.</p></main>;
}
