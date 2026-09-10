import type { ValidationReport } from "@silogium/authoring";

export function ValidationDetails({ report }: { report: ValidationReport }) {
  const coverage = report.coverage;
  return <details>
    <summary>Ver verificações ({report.checks.filter((check) => check.passed).length}/{report.checks.length})</summary>
    <ul className="validation-list">{report.checks.map((check, index) => <li key={`${check.name}-${index}`} className={check.passed ? "success-text" : "danger-text"}>
      {check.passed ? "✓" : "×"} {check.name}{!check.passed && check.message ? ` — ${check.message}` : ""}
    </li>)}</ul>
    {coverage && <div className="validation-coverage">
      <p className="muted">{coverage.visibleCases} testes visíveis · {coverage.hiddenCases} ocultos · {coverage.distinctInputs} entradas distintas</p>
      {coverage.observedSignals.length > 0 && <p className="muted">Indícios de cobertura: {coverage.observedSignals.join(", ")}.</p>}
      {coverage.mutationChecks.length > 0 && <p className="muted">Variantes defeituosas detectadas: {coverage.mutationChecks.filter((check) => check.status === "killed").length}. Não aplicáveis: {coverage.mutationChecks.filter((check) => check.status === "not_applicable").length}.</p>}
    </div>}
    {report.warnings?.length ? <ul className="validation-list muted">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
  </details>;
}
