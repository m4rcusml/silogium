import Link from "next/link";
import { ArrowRight, Sparkles, TerminalSquare } from "lucide-react";
import { ProblemCard } from "../components/problem-card";
import { getAuthoringRepository } from "@/lib/authoring";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const problems = await getAuthoringRepository().listCatalog();
  return <main className="container">
    <section className="hero">
      <span className="eyebrow">Pense · Resolva · Submeta</span>
      <h1>Questões que encontram o seu próximo desafio.</h1>
      <p className="lead">Descreva o que quer praticar. O Silogium encontra uma questão licenciada ou cria uma nova, pronta para resolver no navegador ou no seu terminal.</p>
      <div className="hero-actions"><Link className="button primary" href="/assistente"><Sparkles size={17} /> Pedir uma questão</Link><Link className="button" href="/explorar">Explorar catálogo <ArrowRight size={17} /></Link></div>
      <div className="stats"><div className="stat"><strong>{problems.length}</strong><span>avaliações originais disponíveis</span></div><div className="stat"><strong>2</strong><span>runtimes: TypeScript e Python</span></div><div className="stat"><strong><TerminalSquare size={22} /></strong><span>mesmo fluxo no site e terminal</span></div></div>
    </section>
    <section><div className="section-heading"><div><span className="eyebrow">Comece agora</span><h2>Questões em destaque</h2></div><Link className="muted" href="/explorar">Ver todas →</Link></div><div className="grid">{problems.slice(0, 6).map((problem) => <ProblemCard key={problem.id} problem={problem} />)}</div></section>
  </main>;
}
