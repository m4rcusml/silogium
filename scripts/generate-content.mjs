import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClassicSeeds } from "./classic-seeds.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(root, "content", "problems", "registry.json"), "utf8"));
const generatedAt = "2026-09-08T12:00:00.000Z";
// Canonical source text must not depend on Git's Windows checkout line endings.
// Do not apply this to fixtures: whitespace there is part of the judge contract.
const sourceText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const problems = registry.map((item) => ({
  schemaVersion: 1,
  id: item.id,
  version: 1,
  slug: item.slug,
  title: item.title,
  summary: item.summary,
  locale: "pt-BR",
  origin: "native",
  visibility: "public",
  status: "published",
  format: "progressive",
  executionModel: "call-sequence",
  difficulty: item.difficulty,
  tags: item.tags,
  stages: [1, 2, 3, 4].map((number) => ({
    number,
    statementMd: sourceText(join(root, "questions", item.questionDirectory, `LEVEL_${number}.md`)),
    points: 150
  })),
  runtimes: [
    {
      language: "typescript",
      version: "22.22.0",
      starterCode: sourceText(join(root, item.typescriptStarter)),
      entrypoint: { kind: "class", symbol: item.typescriptSymbol, methodMap: {} }
    },
    {
      language: "python",
      version: "3.13.11",
      starterCode: sourceText(join(root, item.pythonStarter)),
      entrypoint: { kind: "class", symbol: item.pythonSymbol, methodMap: item.pythonMethods }
    }
  ],
  examples: [],
  limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
  provenance: {
    kind: "native",
    createdBy: "system",
    createdByHandle: "silogium",
    assistedByAi: false,
    statementLicense: "CC-BY-4.0",
    codeLicense: "MIT"
  },
  createdAt: generatedAt,
  updatedAt: generatedAt
}));

const target = join(root, "packages", "core", "src", "generated-catalog.ts");
const classics = buildClassicSeeds(root);
problems.push(...classics.map((item) => item.problem));
for (const { problem, bundle } of classics) {
  writeFileSync(join(root, "content/judge", `${problem.slug}.visible.json`), JSON.stringify(bundle, null, 2) + "\n", "utf8");
}
writeFileSync(target, `// Gerado por npm run content:generate. Não edite manualmente.\nimport type { ProblemDefinition } from "./schemas.js";\n\nexport const seedProblems: ProblemDefinition[] = ${JSON.stringify(problems, null, 2)};\n`, "utf8");
writeFileSync(join(root, "content", "problems", "generated-catalog.json"), JSON.stringify(problems, null, 2) + "\n", "utf8");
console.log(`Catálogo gerado: ${problems.length} questões.`);
