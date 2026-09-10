import type { ProblemDefinition } from "@silogium/core";

/** The public manifest never includes upstream fixtures or example-solution contents. */
export function SourceAttribution({ provenance }: { provenance: ProblemDefinition["provenance"] }) {
  if (provenance.kind !== "licensed_import") return null;
  return <details className="source-attribution">
    <summary>Fonte, licença e atribuição</summary>
    <p>Adaptada de <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">{provenance.sourceName}</a> · {provenance.licenseSpdx}.</p>
    {provenance.authors.length > 0 && <p>Autoria original: {provenance.authors.join(", ")}.</p>}
    {provenance.contributors.length > 0 && <p>Contribuições: {provenance.contributors.join(", ")}.</p>}
    {provenance.commitSha && <p>Versão da fonte: <code>{provenance.commitSha}</code></p>}
    {provenance.sourceSnapshot && <p>{provenance.sourceSnapshot.files.length} arquivos capturados, {provenance.sourceSnapshot.totalBytes.toLocaleString("pt-BR")} bytes. Convertidos para uma solução de arquivo único.</p>}
    {provenance.legalNotices?.map((notice) => <details key={notice.path}>
      <summary>{notice.path}</summary>
      <pre>{notice.text}</pre>
      <a href={notice.url} target="_blank" rel="noreferrer">Ver aviso na versão original</a>
    </details>)}
  </details>;
}
