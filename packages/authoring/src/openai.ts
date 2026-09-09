import OpenAI from "openai";
import { type Actor, type ContentRequest, type JudgeBundle, type ProblemDefinition, type Runtime } from "@silogium/core";
import type { AiAuthoringAdapter, LicensedExerciseSource, SearchCandidate } from "./types.js";

const generatedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "tags", "statementMd", "starterCode", "referenceSolution", "visibleCases", "hiddenCases"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    statementMd: { type: "string" },
    starterCode: { type: "string" },
    referenceSolution: { type: "string" },
    visibleCases: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["name", "stdin", "expectedStdout"], properties: { name: { type: "string" }, stdin: { type: "string" }, expectedStdout: { type: "string" } } } },
    hiddenCases: { type: "array", minItems: 2, items: { type: "object", additionalProperties: false, required: ["name", "stdin", "expectedStdout"], properties: { name: { type: "string" }, stdin: { type: "string" }, expectedStdout: { type: "string" } } } }
  }
} as const;

const progressiveGeneratedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "tags", "symbol", "stages", "starterCode", "referenceSolution", "visibleCases", "hiddenCases"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    symbol: { type: "string" },
    stages: {
      type: "array", minItems: 4, maxItems: 4,
      items: {
        type: "object", additionalProperties: false, required: ["number", "statementMd"],
        properties: { number: { type: "integer" }, statementMd: { type: "string" } }
      }
    },
    starterCode: { type: "string" },
    referenceSolution: { type: "string" },
    visibleCases: { type: "array", minItems: 4, items: { $ref: "#/$defs/case" } },
    hiddenCases: { type: "array", minItems: 4, items: { $ref: "#/$defs/case" } }
  },
  $defs: {
    case: {
      type: "object", additionalProperties: false, required: ["name", "stage", "constructorArgsJson", "calls"],
      properties: {
        name: { type: "string" }, stage: { type: "integer" }, constructorArgsJson: { type: "string" },
        calls: {
          type: "array", minItems: 1,
          items: {
            type: "object", additionalProperties: false, required: ["method", "argsJson", "expectedJson"],
            properties: { method: { type: "string" }, argsJson: { type: "string" }, expectedJson: { type: "string" } }
          }
        }
      }
    }
  }
} as const;

type Generated = {
  title: string; summary: string; tags: string[]; statementMd: string; starterCode: string; referenceSolution: string;
  visibleCases: Array<{ name: string; stdin: string; expectedStdout: string }>;
  hiddenCases: Array<{ name: string; stdin: string; expectedStdout: string }>;
};

type ProgressiveGenerated = {
  title: string;
  summary: string;
  tags: string[];
  symbol: string;
  stages: Array<{ number: number; statementMd: string }>;
  starterCode: string;
  referenceSolution: string;
  visibleCases: ProgressiveCase[];
  hiddenCases: ProgressiveCase[];
};
type ProgressiveCase = {
  name: string;
  stage: number;
  constructorArgsJson: string;
  calls: Array<{ method: string; argsJson: string; expectedJson: string }>;
};

function slugify(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export class OpenAiAuthoringAdapter implements AiAuthoringAdapter {
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly discoveryModel = "gpt-5.6-luna", private readonly authoringModel = "gpt-5.6-terra") {
    this.client = new OpenAI({ apiKey });
  }

  async create(input: Extract<ContentRequest, { mode: "create" }>, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }> {
    if (input.format === "progressive") return this.createProgressive(input, actor);
    const response = await this.client.responses.create({
      model: this.authoringModel,
      store: false,
      safety_identifier: `silogium_${actor.id}`,
      instructions: "Você cria questões originais de programação em PT-BR. Não pesquise nem reproduza questões existentes. A solução usa stdin/stdout, deve ser inequívoca e todos os casos precisam corresponder ao enunciado.",
      input: `Crie uma questão ${input.difficulty}, formato ${input.format}, para ${input.runtime}. Pedido do usuário: ${input.prompt}`,
      text: { format: { type: "json_schema", name: "generated_problem", strict: true, schema: generatedSchema } }
    } as never);
    const generated = JSON.parse(response.output_text) as Generated;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const problem: ProblemDefinition = {
      schemaVersion: 1, id, version: 1, slug: `${slugify(generated.title)}-${id.slice(0, 6)}`,
      title: generated.title, summary: generated.summary, locale: "pt-BR", origin: "native",
      visibility: input.visibility, status: "validating", format: "classic", executionModel: "stdio",
      difficulty: input.difficulty, tags: generated.tags,
      stages: [{ number: 1, statementMd: generated.statementMd, points: 100 }],
      runtimes: [{ language: input.runtime, version: input.runtime === "typescript" ? "22.22.0" : "3.13.11", starterCode: generated.starterCode, entrypoint: { kind: "stdio" } }],
      examples: [], limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
      provenance: { kind: "native", createdBy: actor.id, createdByHandle: actor.handle, assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
      createdAt: now, updatedAt: now
    };
    const mapCases = (cases: Generated["visibleCases"], prefix: string) => cases.map((item, index) => ({ kind: "stdio" as const, id: `${prefix}-${index + 1}`, name: item.name, stage: 1, stdin: item.stdin, expectedStdout: item.expectedStdout }));
    return {
      problem,
      bundle: { schemaVersion: 1, problemId: id, problemVersion: 1, visibleCases: mapCases(generated.visibleCases, "visible"), hiddenCases: mapCases(generated.hiddenCases, "hidden"), referenceSolutions: { [input.runtime]: generated.referenceSolution } }
    };
  }

  private async createProgressive(input: Extract<ContentRequest, { mode: "create" }>, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }> {
    const language = input.runtime === "typescript" ? "TypeScript" : "Python";
    const response = await this.client.responses.create({
      model: this.authoringModel,
      store: false,
      safety_identifier: `silogium_${actor.id}`,
      instructions: `Você cria uma questão original e progressiva de programação em PT-BR. Não pesquise nem reproduza questões existentes. Crie exatamente quatro níveis cumulativos sobre uma classe stateful. Cada caso instancia a classe uma vez e executa chamadas em sequência. O starter deve compilar, mas não resolver a questão. A solução de referência deve implementar todos os níveis em ${language}. Use somente valores JSON nas assinaturas. Em constructorArgsJson, argsJson e expectedJson devolva JSON válido codificado como string.`,
      input: `Crie uma questão ${input.difficulty} para ${language}. Pedido do usuário: ${input.prompt}`,
      text: { format: { type: "json_schema", name: "progressive_problem", strict: true, schema: progressiveGeneratedSchema } }
    } as never);
    const generated = JSON.parse(response.output_text) as ProgressiveGenerated;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const stages = [...generated.stages].sort((left, right) => left.number - right.number).map((stage, index) => ({
      number: index + 1,
      statementMd: stage.statementMd,
      points: 150
    }));
    const problem: ProblemDefinition = {
      schemaVersion: 1,
      id,
      version: 1,
      slug: `${slugify(generated.title)}-${id.slice(0, 8)}`,
      title: generated.title,
      summary: generated.summary,
      locale: "pt-BR",
      origin: "native",
      visibility: input.visibility,
      status: "validating",
      format: "progressive",
      executionModel: "call-sequence",
      difficulty: input.difficulty,
      tags: generated.tags,
      stages,
      runtimes: [{
        language: input.runtime,
        version: input.runtime === "typescript" ? "22.22.0" : "3.13.11",
        starterCode: generated.starterCode,
        entrypoint: { kind: "class", symbol: generated.symbol, methodMap: {} }
      }],
      examples: [],
      limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
      provenance: { kind: "native", createdBy: actor.id, createdByHandle: actor.handle, assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" },
      createdAt: now,
      updatedAt: now
    };
    const mapCases = (cases: ProgressiveCase[], prefix: string) => cases.map((test, index) => ({
      kind: "call-sequence" as const,
      id: `${prefix}-${index + 1}`,
      name: test.name,
      stage: test.stage,
      constructorArgs: JSON.parse(test.constructorArgsJson) as unknown[],
      calls: test.calls.map((call) => ({
        method: call.method,
        args: JSON.parse(call.argsJson) as unknown[],
        expected: JSON.parse(call.expectedJson) as unknown
      }))
    }));
    return {
      problem,
      bundle: {
        schemaVersion: 1,
        problemId: id,
        problemVersion: 1,
        visibleCases: mapCases(generated.visibleCases, "visible"),
        hiddenCases: mapCases(generated.hiddenCases, "hidden"),
        referenceSolutions: { [input.runtime]: generated.referenceSolution }
      }
    };
  }

  async importLicensed(source: LicensedExerciseSource, actor: Actor): Promise<{ problem: ProblemDefinition; bundle: JudgeBundle }> {
    const response = await this.client.responses.create({
      model: this.authoringModel,
      store: false,
      safety_identifier: `silogium_${actor.id}`,
      instructions: "Converta o exercício licenciado fornecido para uma questão clássica autocontida em PT-BR e stdin/stdout. Preserve a semântica central e a atribuição; não acrescente conteúdo de outras fontes. Produza starter que compile, solução de referência e casos visíveis e ocultos coerentes. Não inclua textos sobre a conversão no enunciado.",
      input: `Fonte: ${source.sourceName}\nURL: ${source.sourceUrl}\nLicença: ${source.licenseSpdx}\nRuntime: ${source.runtime}\n\nINSTRUÇÕES:\n${source.instructions}\n\nSTARTER ORIGINAL:\n${source.starterCode}\n\nTESTES ORIGINAIS:\n${source.sourceTests}`,
      text: { format: { type: "json_schema", name: "licensed_problem", strict: true, schema: generatedSchema } }
    } as never);
    const generated = JSON.parse(response.output_text) as Generated;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const problem: ProblemDefinition = {
      schemaVersion: 1,
      id,
      version: 1,
      slug: `${slugify(generated.title)}-${id.slice(0, 8)}`,
      title: generated.title,
      summary: generated.summary,
      locale: "pt-BR",
      origin: "licensed_import",
      visibility: "private",
      status: "validating",
      format: "classic",
      executionModel: "stdio",
      difficulty: "medium",
      tags: generated.tags,
      stages: [{ number: 1, statementMd: generated.statementMd, points: 100 }],
      runtimes: [{ language: source.runtime, version: source.runtime === "typescript" ? "22.22.0" : "3.13.11", starterCode: generated.starterCode, entrypoint: { kind: "stdio" } }],
      examples: [],
      limits: { timeMs: 2_000, memoryMiB: 256, outputBytes: 65_536 },
      provenance: {
        kind: "licensed_import",
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        repositoryUrl: source.repositoryUrl,
        licenseUrl: source.licenseUrl,
        licenseSpdx: source.licenseSpdx,
        authors: source.authors,
        contributors: source.contributors,
        importedBy: actor.id,
        importedByHandle: actor.handle,
        commitSha: source.commitSha,
        retrievedAt: source.retrievedAt
      },
      createdAt: now,
      updatedAt: now
    };
    const mapCases = (cases: Generated["visibleCases"], prefix: string) => cases.map((item, index) => ({ kind: "stdio" as const, id: `${prefix}-${index + 1}`, name: item.name, stage: 1, stdin: item.stdin, expectedStdout: item.expectedStdout }));
    return {
      problem,
      bundle: {
        schemaVersion: 1,
        problemId: id,
        problemVersion: 1,
        visibleCases: mapCases(generated.visibleCases, "visible"),
        hiddenCases: mapCases(generated.hiddenCases, "hidden"),
        referenceSolutions: { [source.runtime]: generated.referenceSolution }
      }
    };
  }

  async searchWeb(prompt: string, runtime: Runtime, actor: Actor): Promise<SearchCandidate[]> {
    const response = await this.client.responses.create({
      model: this.discoveryModel,
      store: false,
      safety_identifier: `silogium_${actor.id}`,
      include: ["web_search_call.action.sources"],
      max_tool_calls: 4,
      tools: [{ type: "web_search" }],
      input: `Encontre exercícios de programação sobre: ${prompt}. Linguagem: ${runtime}. Não copie enunciados. Resuma e cite somente páginas da fonte original.`
    } as never);
    const candidates: SearchCandidate[] = [];
    for (const item of response.output as unknown as Array<Record<string, unknown>>) {
      if (item.type !== "message") continue;
      for (const content of (item.content ?? []) as Array<Record<string, unknown>>) {
        for (const annotation of (content.annotations ?? []) as Array<Record<string, unknown>>) {
          if (annotation.type !== "url_citation" || typeof annotation.url !== "string") continue;
          candidates.push({
            id: `external-${candidates.length + 1}`,
            kind: "external_link",
            title: typeof annotation.title === "string" ? annotation.title : new URL(annotation.url).hostname,
            summary: "Resultado externo. O enunciado permanece no site de origem.",
            url: annotation.url,
            sourceName: new URL(annotation.url).hostname,
            runtime,
            importable: false
          });
        }
      }
    }
    return candidates.slice(0, 3);
  }
}
