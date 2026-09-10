"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, FilePenLine } from "lucide-react";
import type { ProblemDefinition } from "@silogium/core";
import { problemOrigin, readStudioResponse, studioError, visibilityLabel } from "./studio-request";
import { ProblemAuthoringEditor } from "./problem-authoring-editor";

const statusGuidance: Record<ProblemDefinition["status"], { label: string; next: string; editLabel: string }> = {
  draft: { label: "Rascunho", next: "Abra o editor para completar o enunciado e os testes. Salve o rascunho e escolha “Validar versão” antes de resolver.", editLabel: "Abrir editor para validar" },
  validating: { label: "Validação em andamento", next: "Aguarde a verificação do código inicial, da referência e dos testes. Consulte o editor para acompanhar antes de fazer novas alterações.", editLabel: "Consultar validação" },
  validated: { label: "Pronta para resolver", next: "Os testes automáticos passaram: você já pode resolver esta questão. Compartilhar no catálogo é opcional e depende de revisão.", editLabel: "Editar questão" },
  pending_review: { label: "Aguardando revisão", next: "Você já pode resolver. O pedido de publicação está com a administração; esta versão só entra no catálogo depois da aprovação.", editLabel: "Consultar revisão" },
  published: { label: "Publicada no catálogo", next: "Esta versão está no catálogo. Você pode resolver ou preparar uma alteração; a versão publicada só muda após uma nova revisão.", editLabel: "Preparar nova versão" },
  rejected: { label: "Precisa de ajustes", next: "Revise o enunciado e os testes no editor. Salve as correções e valide novamente antes de resolver ou pedir publicação.", editLabel: "Corrigir questão" }
};

export function MyProblems({ refreshKey }: { refreshKey?: string }) {
  const searchParams = useSearchParams();
  const editSlug = searchParams.get("edit");
  function edit(slug?: string) {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("edit", slug); else url.searchParams.delete("edit");
    window.history.replaceState(window.history.state, "", url);
  }
  const [problems, setProblems] = useState<ProblemDefinition[] | null>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [publicationId, setPublicationId] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setError(undefined);
    async function load() {
      try {
        const response = await fetch("/api/v1/problems/mine", { cache: "no-store", signal: controller.signal });
        const body = await readStudioResponse<{ problems: ProblemDefinition[] }>(response, "Não foi possível carregar suas questões");
        if (!Array.isArray(body.problems)) throw new Error("Não foi possível ler sua biblioteca.");
        if (!disposed) setProblems(body.problems);
      } catch (caught) {
        if (!disposed) setError(studioError(caught));
      }
    }
    void load();
    return () => { disposed = true; controller.abort(); };
  }, [reload, refreshKey]);

  async function publish(problem: ProblemDefinition) {
    if (!accepted || publishing) return;
    setPublishing(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/problems/${problem.slug}/publication`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ licensesAccepted: true }) });
      if (!response.ok) await readStudioResponse(response, "Não foi possível solicitar publicação");
      setMessage(`“${problem.title}” foi enviada para revisão. Esta versão só aparecerá no catálogo depois da aprovação; você já pode continuar resolvendo.`);
      setPublicationId(undefined);
      setAccepted(false);
      setReload((value) => value + 1);
    } catch (caught) {
      setError(studioError(caught));
    } finally {
      setPublishing(false);
    }
  }

  return <div className="my-question-library">
    <div className="library-orientation">
      <p>Aqui ficam as questões que você <strong>criou ou importou</strong> para editar, validar e resolver. Questões que você apenas salvou como favoritas ficam em <Link href="/explorar">Praticar → Sua biblioteca e simulados</Link>.</p>
      {!editSlug && <>
        <ol className="library-lifecycle" aria-label="Da criação à resolução">
          <li><span aria-hidden="true">1</span><div><strong>Prepare o rascunho</strong><p>Edite o enunciado e os testes.</p></div></li>
          <li><span aria-hidden="true">2</span><div><strong>Valide a questão</strong><p>Confira se tudo funciona junto.</p></div></li>
          <li><span aria-hidden="true">3</span><div><strong>Resolva quando quiser</strong><p>Não é preciso publicar para praticar.</p></div></li>
        </ol>
        <p className="library-publication-note"><strong>Publicação é opcional.</strong> Se quiser compartilhar no catálogo, solicite uma revisão depois da validação.</p>
      </>}
    </div>
    {editSlug && <div className="library-editing-context">
      <p><strong>Você está editando a questão, não sua solução.</strong> Salve o rascunho e use “Validar versão”. Salvar não publica nem substitui a versão que outras pessoas já resolveram.</p>
      <p>Para escrever sua resposta ao desafio, use “Resolver esta versão” depois de validar. A lista abaixo pode mostrar a versão anterior enquanto você trabalha neste rascunho.</p>
    </div>}
    {editSlug && <ProblemAuthoringEditor slug={editSlug} onClose={() => edit()} onSaved={() => setReload((value) => value + 1)} />}
    {message && <div className="notice" role="status">{message}</div>}
    {error && <div className="notice danger-text" role="alert"><p>{error}</p><button className="button" type="button" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></div>}
    {!problems && !error && <div className="empty" role="status">Carregando suas questões…</div>}
    {problems?.length === 0 && <div className="empty library-empty"><FilePenLine size={22} aria-hidden="true" /><h2>Você ainda não criou ou importou uma questão.</h2><p>Peça um desafio novo ao assistente ou pesquise uma fonte licenciada para importar. Um link externo, sem importação, não aparece nesta lista.</p><div className="library-empty-actions"><Link className="button primary" href="/studio?mode=create">Criar questão</Link><Link className="button" href="/studio?mode=search">Pesquisar questões</Link></div></div>}
    {Boolean(problems?.length) && <section className="library-saved-questions" aria-label="Suas questões criadas e importadas">
      <div className="library-list-heading"><h2>Questões salvas</h2><span>{problems!.length} {problems!.length === 1 ? "questão" : "questões"}</span></div>
      <div className="studio-problem-list">
      {problems!.map((problem) => <article className="studio-problem-row" key={problem.id} aria-labelledby={`library-title-${problem.id}`}>
        <div className="library-question-main">
          <h3 id={`library-title-${problem.id}`}>{problem.title}</h3><p>{problem.summary}</p><span className="library-question-origin">{problemOrigin(problem)}</span>
          <dl className="library-question-meta">
            <div><dt>Estado</dt><dd className="library-state" data-state={problem.status}>{statusGuidance[problem.status].label}</dd></div>
            <div><dt>Acesso</dt><dd>{problem.visibility === "public" && problem.status !== "published" ? "Catálogo só após aprovação" : visibilityLabel[problem.visibility]}</dd></div>
            <div><dt>Formato</dt><dd>{problem.format === "progressive" ? `Progressiva · ${problem.stages.length} níveis` : "Clássica"}</dd></div>
            <div><dt>Linguagem</dt><dd>{problem.runtimes.map((runtime) => runtime.language === "typescript" ? "TypeScript" : "Python").join(" e ")}</dd></div>
          </dl>
        </div>
        <div className="library-next-step">
          <strong>Próximo passo</strong><p>{statusGuidance[problem.status].next}</p>
          <div className="studio-row-actions">
            {["validated", "pending_review", "published"].includes(problem.status) && <Link className="button primary" href={`/problemas/${problem.slug}`}>Resolver <ArrowRight size={14} aria-hidden="true" /></Link>}
            <button type="button" className={`button${["draft", "rejected"].includes(problem.status) ? " primary" : ""}`} onClick={() => edit(problem.slug)}>{statusGuidance[problem.status].editLabel}</button>
            {problem.status === "validated" && <button type="button" className="button" aria-expanded={publicationId === problem.id} aria-controls={`publication-${problem.id}`} disabled={publishing} onClick={() => { setPublicationId(publicationId === problem.id ? undefined : problem.id); setAccepted(false); }}>Solicitar publicação</button>}
          </div>
        </div>
        {publicationId === problem.id && <div className="studio-publication-consent" id={`publication-${problem.id}`}>
          <h4>Enviar para revisão, não publicar agora</h4><p>A administração revisará esta versão. Ela só ficará disponível para todos no catálogo se for aprovada. Você pode continuar resolvendo enquanto aguarda.</p>
          <label className="license-consent"><input type="checkbox" checked={accepted} disabled={publishing} onChange={(event) => setAccepted(event.target.checked)} /><span>{problem.provenance.kind === "native" ? "Aceito publicar o enunciado sob CC BY 4.0 e o starter e testes visíveis sob MIT, com crédito permanente ao autor." : `Confirmo a atribuição à fonte ${problem.provenance.sourceName} e a manutenção da licença original ${problem.provenance.licenseSpdx}.`}</span></label>
          <div className="studio-inline-actions"><button type="button" className="button primary" disabled={!accepted || publishing} onClick={() => void publish(problem)}>{publishing ? "Enviando para revisão…" : "Enviar para revisão"}</button><button type="button" className="button" disabled={publishing} onClick={() => setPublicationId(undefined)}>Cancelar</button></div>
        </div>}
      </article>)}
      </div>
    </section>}
  </div>;
}
