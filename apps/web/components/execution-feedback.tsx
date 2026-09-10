"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Play, XCircle } from "lucide-react";
import type { ExecutionResult, JudgeCase } from "@silogium/core";

export const verdictLabels: Record<ExecutionResult["verdict"], string> = {
  accepted: "Aceita", wrong_answer: "Resposta incorreta", compile_error: "Erro de compilação",
  runtime_error: "Erro de execução", time_limit: "Tempo excedido", memory_limit: "Memória excedida",
  output_limit: "Saída excedida", system_error: "Erro de infraestrutura"
};

function display(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "undefined";
}

function legacyMismatch(message?: string) {
  const match = message?.match(/^(.*?)(?:: esperado |Esperado )([\s\S]*), recebido ([\s\S]*)$/);
  if (!match) return null;
  const parse = (text: string) => { try { return JSON.parse(text); } catch { return text; } };
  return { method: match[1], expected: parse(match[2]!), actual: parse(match[3]!) };
}

export function ExecutionFeedback({ result, visibleCases, busy, onRunCase, onCopyCase, children, acceptedLabel = "Aceita" }: {
  result: ExecutionResult;
  visibleCases: JudgeCase[];
  busy: boolean;
  onRunCase: (id: string) => void;
  onCopyCase: (test: JudgeCase) => void;
  children?: ReactNode;
  acceptedLabel?: string;
}) {
  const [selected, setSelected] = useState(result.cases.find((item) => !item.passed)?.id ?? result.cases[0]?.id);
  const test = result.cases.find((item) => item.id === selected);
  const publicCase = visibleCases.find((item) => item.id === selected);
  const mismatch = test?.mismatch ?? legacyMismatch(test?.message);
  const stages = [...new Set(result.cases.map((item) => item.stage))];
  return <div className="execution-feedback">
    {children}
    <div className="execution-summary" role="status">
      <strong className={result.verdict === "accepted" ? "success-text" : result.verdict === "system_error" ? "muted" : "danger-text"}>
        {result.verdict === "accepted" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        {result.verdict === "accepted" ? acceptedLabel : verdictLabels[result.verdict]}
      </strong>
      <span>{result.score}/{result.maxScore} pontos</span><span>{result.durationMs} ms</span>
      <code>{result.verdict}</code>
    </div>
    {result.message && <p className="result-message" role={result.verdict === "system_error" ? "alert" : undefined}>{result.message}</p>}
    {stages.length > 1 && <div className="stage-results">{stages.map((stage) => {
      const cases = result.cases.filter((item) => item.stage === stage);
      return <span key={stage}>N{stage} · {cases.filter((item) => item.passed).length}/{cases.length} testes</span>;
    })}</div>}
    {result.cases.length > 0 && <div className="test-results">
      <div className="test-case-list" aria-label="Casos executados">{result.cases.map((item) => <button type="button" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)} key={item.id}>
        <span className={item.passed ? "success-text" : "danger-text"}>{item.passed ? "✓" : "×"}</span>
        <span><strong>{item.name}</strong><small>Nível {item.stage} · {item.passed ? "passou" : "falhou"}</small></span>
      </button>)}</div>
      <div className="test-detail">
        {test && <>
          <strong>{mismatch?.method || test.name}</strong>
          {mismatch ? <div className="value-diff"><div><span>Esperado</span><pre>{display(mismatch.expected)}</pre></div><div><span>Recebido</span><pre>{display(mismatch.actual)}</pre></div></div>
            : <p className={test.passed ? "success-text" : "danger-text"}>{test.passed ? "Este caso passou." : test.message ?? "Teste oculto: detalhes indisponíveis."}</p>}
          {publicCase && <div className="case-actions"><button className="button" type="button" disabled={busy} onClick={() => onRunCase(publicCase.id)}><Play size={13} /> Executar este caso</button><button className="button ghost" type="button" onClick={() => onCopyCase(publicCase)}><Copy size={13} /> Usar como teste próprio</button></div>}
        </>}
      </div>
    </div>}
  </div>;
}
