"use client";

import { Play } from "lucide-react";
import { MAX_CUSTOM_TEST_LENGTH } from "../lib/practice-preferences";

export function CustomTestEditor({ value, onChange, onRun, busy, error }: {
  value: string; onChange: (value: string) => void; onRun: () => void; busy: boolean; error?: string;
}) {
  return <div className="custom-test-editor">
    <div className="custom-test-heading"><div><label htmlFor="custom-cases">Casos em JSON</label><p>Edite a entrada e a resposta esperada. Estes casos não alteram a avaliação oficial.</p></div><button className="button" type="button" disabled={busy} onClick={onRun}><Play size={14} /> Executar meus testes</button></div>
    <textarea id="custom-cases" value={value} maxLength={MAX_CUSTOM_TEST_LENGTH} spellCheck={false} onChange={(event) => onChange(event.target.value)} aria-describedby={error ? "custom-test-error" : undefined} />
    {error && <p id="custom-test-error" className="danger-text" role="alert">{error}</p>}
  </div>;
}
