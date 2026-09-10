import type { ProblemDefinition } from "./schemas.js";

export function renderProblemAttribution(problem: ProblemDefinition): string {
  const source = problem.provenance;
  if (source.kind === "native") return `Autoria: @${source.createdByHandle ?? "autor"}${source.assistedByAi ? " com assistência da IA" : ""}.\nEnunciado: ${source.statementLicense}; starter e testes visíveis: ${source.codeLicense}.\n`;
  const lines = [`Fonte: ${source.sourceName}`, `URL: ${source.sourceUrl}`, `Licença: ${source.licenseSpdx}`, `Autoria original: ${source.authors.join(", ")}`];
  if (source.contributors.length) lines.push(`Contribuições: ${source.contributors.join(", ")}`);
  if (source.commitSha) lines.push(`Commit: ${source.commitSha}`);
  if (source.licenseUrl) lines.push(`Licença original: ${source.licenseUrl}`);
  for (const notice of source.legalNotices ?? []) lines.push(`\n--- ${notice.path} ---\n${notice.text}`);
  return lines.join("\n") + "\n";
}
