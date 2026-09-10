"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, X } from "lucide-react";
import type { ExecutionResult, ProblemDefinition } from "@silogium/core";
import type { SubmissionContext, SubmissionOutcome } from "./submission-outcome";
import styles from "./submission-completion.module.css";

type FeedbackProps = {
  problem: ProblemDefinition;
  context: SubmissionContext;
  outcome: SubmissionOutcome;
  onOpenCompletion: () => void;
  onSubmit: () => void;
  onAdvance: (stage: number) => void;
};

/** Runs get a next step, never a completion badge or a reward. */
export function SubmissionNextStep({ problem, context, outcome, onOpenCompletion, onSubmit, onAdvance }: FeedbackProps) {
  if (outcome.kind === "none") return null;
  if (outcome.kind === "completed") return <section className={styles.nextStep} aria-label="Questão resolvida">
    <CheckCircle2 size={19} className={styles.successIcon} aria-hidden="true" />
    <div><strong>Questão resolvida</strong><p>{outcome.passedCases} testes passaram{problem.format === "progressive" ? ` · ${outcome.stageCount} níveis concluídos` : ""} neste envio.</p></div>
    <button className="button ghost" type="button" onClick={onOpenCompletion}>Ver conclusão <ArrowRight size={14} aria-hidden="true" /></button>
  </section>;

  const nextStage = problem.stages.filter((stage) => stage.number > context.maxStage).sort((left, right) => left.number - right.number)[0];
  const title = context.scope === "custom" ? "Seus testes passaram" : context.scope === "selected" ? "O caso selecionado passou" : "Testes visíveis passaram";
  return <section className={styles.nextStep} aria-label="Resultado da prática">
    <CheckCircle2 size={19} className={styles.successIcon} aria-hidden="true" />
    <div><strong>{title}</strong><p>{context.scope !== "visible" ? "Isso verifica apenas os casos escolhidos, não conclui a questão." : nextStage ? `Os testes visíveis até o nível ${context.maxStage} passaram. Continue com os próximos requisitos.` : "Submeta sua solução para avaliar todos os testes da questão."}</p></div>
    {context.scope === "visible" && (nextStage
      ? <button className="button ghost" type="button" onClick={() => onAdvance(nextStage.number)}>Avançar para o nível {nextStage.number} <ArrowRight size={14} aria-hidden="true" /></button>
      : <button className="button ghost" type="button" onClick={onSubmit}>Submeter solução <ArrowRight size={14} aria-hidden="true" /></button>)}
  </section>;
}

/** Presentation only: the judge and server-side progress rules remain authoritative. */
export function SubmissionCompletionDialog({ problem, context, result, open, onClose, onReview, onEdit }: {
  problem: ProblemDefinition;
  context: SubmissionContext;
  result: ExecutionResult;
  open: boolean;
  onClose: () => void;
  onReview: () => void;
  onEdit: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      heading.current?.focus({ preventScroll: true });
      element.scrollTop = 0;
    } else if (!open && element.open) element.close();
  }, [open]);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onClose={onClose}
    onKeyDownCapture={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]")]
        .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      // Some browsers move focus to their chrome at the end of a native dialog.
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus();
      }
    }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className={styles.content}>
      <header className={styles.heading}>
        <span className={styles.seal} aria-hidden="true"><Check size={28} strokeWidth={2.5} /></span>
        <span className={styles.label}>SUBMISSÃO ACEITA</span>
        <button className={`button ghost ${styles.close}`} type="button" aria-label="Fechar confirmação" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className={styles.introduction}>
        <h2 ref={heading} id={titleId} tabIndex={-1}>Questão resolvida!</h2>
        <p id={descriptionId}>Sua solução passou em todos os testes desta avaliação.</p>
      </div>
      <div className={styles.problem}>
        <strong>{problem.title}</strong>
        <span>{context.runtime === "typescript" ? "TypeScript" : "Python"} · versão {problem.version}</span>
      </div>
      <dl className={styles.metrics}>
        <div><dt>Pontos da questão</dt><dd>{result.score}<span>/{result.maxScore}</span></dd></div>
        <div><dt>Testes passaram</dt><dd>{result.cases.length}<span>/{result.cases.length}</span></dd></div>
        <div><dt>Tempo total</dt><dd>{result.durationMs}<span> ms</span></dd></div>
      </dl>
      {problem.format === "progressive" && <ul className={styles.stages} aria-label="Níveis concluídos">{[...problem.stages].sort((left, right) => left.number - right.number).map((stage) => <li key={stage.number}><Check size={14} aria-hidden="true" /><span>Nível {stage.number}</span><small>{stage.points} pts</small></li>)}</ul>}
      {result.message && <p className={styles.note}>{result.message}</p>}
      <footer className={styles.actions}>
        <Link className="button primary" href={`/explorar?runtime=${context.runtime}`} onClick={onClose}>Escolher outra questão <ArrowRight size={16} aria-hidden="true" /></Link>
        <button className="button" type="button" onClick={onReview}>Ver resultado</button>
        <button className={`button ghost ${styles.edit}`} type="button" onClick={onEdit}>Continuar editando</button>
      </footer>
    </div>
  </dialog>;
}
