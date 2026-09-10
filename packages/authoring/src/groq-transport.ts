import { z } from "zod";
import type { GroqCapacity } from "./groq-capacity.js";

export const GROQ_MODEL = "openai/gpt-oss-120b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const ResponseSchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  usage: z.object({ total_tokens: z.number().finite().nonnegative() }).optional(),
  choices: z.array(z.object({ finish_reason: z.string().nullable().optional(), message: z.object({
    content: z.string().nullable().optional(),
    executed_tools: z.array(z.object({ search_results: z.object({ results: z.array(z.object({
      url: z.string().optional(), title: z.string().optional(), content: z.string().optional()
    })).optional() }).nullable().optional() })).optional()
  }) })).optional()
});

export type AiErrorCode = "configuration" | "rate_limit" | "input_too_large" | "invalid_output" | "timeout" | "unavailable";
const messages: Record<AiErrorCode, string> = {
  configuration: "O acesso ao Groq não está disponível. O administrador precisa verificar a chave e as permissões.",
  rate_limit: "A capacidade compartilhada da IA está ocupada. Aguarde a próxima janela de processamento.",
  input_too_large: "Este pedido excede o orçamento de contexto da IA. Reduza o pedido ou use a edição manual.",
  invalid_output: "A IA devolveu conteúdo incompleto ou inválido. Nenhuma questão foi liberada.",
  timeout: "O Groq demorou a responder. O pedido poderá ser retomado.",
  unavailable: "O Groq está temporariamente indisponível. O catálogo continua disponível."
};
export class AiProviderError extends Error {
  constructor(readonly code: AiErrorCode, readonly retryable = false, readonly retryAfterMs = 0) {
    super(messages[code]); this.name = "AiProviderError";
  }
}

export function groqRetryDelay(headers: Headers): number {
  const raw = headers.get("retry-after");
  if (raw && Number.isFinite(Number(raw))) return Math.max(1_000, Number(raw) * 1_000);
  if (raw && Number.isFinite(Date.parse(raw))) return Math.max(1_000, Date.parse(raw) - Date.now());
  const reset = headers.get("x-ratelimit-reset-tokens") ?? "";
  let ms = 0;
  for (const match of reset.matchAll(/([\d.]+)(ms|h|m|s)/g)) ms += Number(match[1]) * ({ ms: 1, h: 3_600_000, m: 60_000, s: 1_000 }[match[2]!] ?? 0);
  return Math.max(1_000, ms || 60_000);
}

export type GroqTransportOptions = {
  apiKey: string;
  fetch?: (url: string, options: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxCompletionTokens?: number;
  webSearch?: boolean;
  capacity?: GroqCapacity;
};

/** Only Groq credentials and the fixed Groq endpoint cross this adapter. */
export class GroqTransport {
  constructor(private readonly options: GroqTransportOptions) {}

  async completion(instructions: string, input: string, extra: Record<string, unknown> = {}) {
    const body = { model: GROQ_MODEL, messages: [{ role: "system", content: instructions }, { role: "user", content: input }],
      temperature: 0, reasoning_effort: "low", max_completion_tokens: this.options.maxCompletionTokens ?? 2400, ...extra };
    const estimated = Math.ceil(Buffer.byteLength(JSON.stringify(body), "utf8") / 3);
    if (estimated > (this.options.maxInputTokens ?? 5000)) throw new AiProviderError("input_too_large");
    const id = crypto.randomUUID();
    const admission = await this.options.capacity?.reserve(id, estimated + body.max_completion_tokens);
    if (admission && !admission.allowed) throw new AiProviderError("rate_limit", true, admission.retryAfterMs ?? 60000);
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 90_000);
    let response: Response;
    let value: z.infer<typeof ResponseSchema>;
    try {
      response = await (this.options.fetch ?? fetch)(ENDPOINT, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify(body), signal
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) {
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length;
          if (size > 2_097_152) { await reader.cancel(); throw new AiProviderError("invalid_output"); } chunks.push(chunk.value); }
        } finally { reader.releaseLock(); }
      }
      try { value = ResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { value = {}; }
    } catch (error) {
      await this.options.capacity?.settle(id);
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(signal.aborted ? "timeout" : "unavailable", true);
    }
    await this.options.capacity?.settle(id, typeof value.usage?.total_tokens === "number" ? value.usage.total_tokens : undefined,
      response.status === 429 ? Math.min(86_400_000, groqRetryDelay(response.headers)) : 0);
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) throw new AiProviderError("configuration");
      if (response.status === 413 || /request_too_large/.test(String(value.error?.code)) || /request too large/i.test(String(value.error?.message))) throw new AiProviderError("input_too_large");
      if (response.status === 429) throw new AiProviderError("rate_limit", true, groqRetryDelay(response.headers));
      if (response.status >= 500) throw new AiProviderError("unavailable", true);
      if (value.error?.code === "json_validate_failed") throw new AiProviderError("invalid_output");
      throw new AiProviderError("configuration");
    }
    if (value.choices?.[0]?.finish_reason !== "stop" || typeof value.choices?.[0]?.message?.content !== "string" || !value.choices[0].message.content.trim()) throw new AiProviderError("invalid_output");
    return { ...value, choices: [{ ...value.choices[0], message: { ...value.choices[0].message, content: value.choices[0].message.content } }] as const };
  }

  async structured<T>(instructions: string, input: string, name: string, schema: object): Promise<T> {
    const value = await this.completion(instructions, input, { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } });
    try { return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]).parse(JSON.parse(value.choices[0].message.content)) as T; }
    catch { throw new AiProviderError("invalid_output"); }
  }
}
