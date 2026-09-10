import { ReviewPanel } from "../../../components/review-panel";
import { CommunityReviewPanel } from "../../../components/problem-community";
import { BetaAccessPanel } from "../../../components/beta-access-panel";
import { OperationalCapacityPanel } from "../../../components/operational-capacity-panel";
import { getOptionalActor } from "@/lib/actor";
import Link from "next/link";
import "./beta.css";

export const metadata = { title: "Revisão editorial" };
export default async function ReviewPage() {
  const actor = await getOptionalActor();
  if (actor?.role !== "admin") return <main className="container page"><h1>Área administrativa</h1><p className="lead">Entre com uma conta administradora para gerenciar participantes e revisar questões.</p><Link className="button" href="/explorar">Voltar ao catálogo</Link></main>;
  return <main className="container page"><span className="eyebrow">Administração</span><h1 style={{ fontSize: 46 }}>Revisão editorial</h1><p className="lead">Gerencie o acesso ao beta e revise o que será publicado no catálogo.</p><div className="admin-sections"><OperationalCapacityPanel /><BetaAccessPanel /><section className="admin-section" aria-label="Questões para revisão"><header><h2>Questões para revisão</h2><p className="muted">Uma validação técnica não substitui a decisão editorial antes de publicar.</p></header><ReviewPanel /></section><CommunityReviewPanel /></div></main>;
}
