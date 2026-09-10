import type { Actor, Runtime } from "@silogium/core";
import { OpenAiAuthoringAdapter } from "./openai.js";
import type { DiscoveryContext, SearchCandidate } from "./types.js";
import { discoverySafetyInstructions, formatDiscoveryContext } from "./discovery.js";
import { WebSearchResultSchema, webSearchInstructions, webSearchJsonSchema } from "./search-result.js";
import { formatConversationContext, type ConversationContext } from "./conversation.js";

export type CodexStructuredRequest = {
  prompt: string;
  schema: object;
  model: string;
  allowWebSearch: boolean;
  timeoutMs: number;
};

export interface CodexStructuredRunner {
  run<T>(request: CodexStructuredRequest): Promise<T>;
}

export type CodexAuthoringOptions = {
  timeoutMs?: number;
  workingDirectory?: string;
  runner?: CodexStructuredRunner;
};

function parseJson<T>(value: string): T {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized) as T;
}

export class CodexSdkStructuredRunner implements CodexStructuredRunner {
  constructor(private readonly workingDirectory = process.cwd()) {}

  async run<T>(request: CodexStructuredRequest): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      // Personal SDK is ESM-only and optional at runtime. Hosted workers never load it.
      const { Codex } = await import("@openai/codex-sdk");
      const codex = new Codex();
      const thread = codex.startThread({
        model: request.model,
        modelReasoningEffort: "low",
        sandboxMode: "read-only",
        approvalPolicy: "never",
        workingDirectory: this.workingDirectory,
        skipGitRepoCheck: true,
        networkAccessEnabled: request.allowWebSearch,
        webSearchMode: request.allowWebSearch ? "live" : "disabled"
      });
      const turn = await thread.run(request.prompt, {
        outputSchema: request.schema,
        signal: controller.signal
      });
      if (!turn.finalResponse.trim()) throw new Error("O Codex não devolveu conteúdo estruturado.");
      return parseJson<T>(turn.finalResponse);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`O Codex excedeu o limite de ${Math.round(request.timeoutMs / 1_000)} segundos.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class CodexAuthoringAdapter extends OpenAiAuthoringAdapter {
  private readonly runner: CodexStructuredRunner;
  private readonly timeoutMs: number;

  constructor(
    private readonly codexAuthoringModel = "gpt-5.6-terra",
    private readonly codexDiscoveryModel = "gpt-5.6-luna",
    options: CodexAuthoringOptions = {}
  ) {
    // A implementação compartilhada do adapter pai cuida da montagem de
    // ProblemDefinition e JudgeBundle. Nenhuma chamada à API ocorre: toda
    // geração estruturada é sobrescrita abaixo e encaminhada ao Codex SDK.
    super("codex-local-unused", codexDiscoveryModel, codexAuthoringModel, { canSearchWeb: false });
    this.timeoutMs = options.timeoutMs ?? 600_000;
    this.runner = options.runner ?? new CodexSdkStructuredRunner(options.workingDirectory);
  }

  protected override generateStructured<T>(instructions: string, input: string, name: string, schema: object, _actor: Actor): Promise<T> {
    return this.runner.run<T>({
      model: this.codexAuthoringModel,
      schema,
      timeoutMs: this.timeoutMs,
      allowWebSearch: false,
      prompt: [
        "Você é o motor interno de autoria do Silogium.",
        "Não execute comandos, não leia arquivos e não altere o sistema. Não pesquise a web.",
        `Produza somente o objeto JSON solicitado pelo schema ${name}.`,
        "",
        "INSTRUÇÕES DO SISTEMA:",
        instructions,
        "",
        "PEDIDO:",
        input
      ].join("\n")
    });
  }

  override async searchWeb(prompt: string, runtime: Runtime, _actor: Actor, context?: DiscoveryContext, conversation?: ConversationContext): Promise<SearchCandidate[]> {
    const result = WebSearchResultSchema.parse(await this.runner.run<unknown>({
      model: this.codexDiscoveryModel,
      schema: webSearchJsonSchema,
      timeoutMs: this.timeoutMs,
      allowWebSearch: true,
      prompt: [
        "Pesquise na web exercícios de programação sobre o pedido abaixo.",
        webSearchInstructions,
        discoverySafetyInstructions,
        "Não execute comandos, não leia arquivos e devolva somente o JSON solicitado.",
        "",
        `Linguagem: ${runtime}`,
        `Pedido: ${prompt}`,
        formatDiscoveryContext(context),
        formatConversationContext(conversation)
      ].join("\n")
    }));

    const seen = new Set<string>();
    return result.candidates.flatMap((candidate, index) => {
      try {
        const url = new URL(candidate.url);
        if (!new Set(["http:", "https:"]).has(url.protocol) || seen.has(url.href)) return [];
        seen.add(url.href);
        return [{
          id: `external-codex-${index + 1}`,
          kind: "external_link" as const,
          title: candidate.title,
          summary: candidate.summary,
          url: url.href,
          sourceName: candidate.sourceName || url.hostname,
          runtime,
          importable: false
        }];
      } catch {
        return [];
      }
    });
  }
}
