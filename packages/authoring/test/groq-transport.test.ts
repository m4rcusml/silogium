import { describe, expect, it, vi } from "vitest";
import { GroqTransport, AiProviderError } from "../src/groq-transport.js";

describe("transporte Groq sem fallback", () => {
  it("usa somente o endpoint Groq e devolve JSON verificado", async () => {
    const http = vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe("openai/gpt-oss-120b");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body).not.toHaveProperty("tools");
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"answer":4}' } }], usage: { total_tokens: 12 } });
    });
    const transport = new GroqTransport({ apiKey: "test-only", fetch: http });
    expect(await transport.structured("Calcule", "2+2", "answer", { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false }))
      .toEqual({ answer: 4 });
  });

  it.each([401, 403, 429, 500])("classifica HTTP %i sem expor corpo nem repetir chamadas", async (status) => {
    const http = vi.fn(async () => Response.json({ error: { message: "SECRET_FROM_PROVIDER" } }, { status, headers: { "retry-after": "65" } }));
    const transport = new GroqTransport({ apiKey: "test-only", fetch: http });
    const error = await transport.structured("x", "y", "answer", {}).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(String(error)).not.toContain("SECRET_FROM_PROVIDER");
    expect((error as AiProviderError).retryable).toBe(status >= 500 || status === 429);
    if (status === 429) expect((error as AiProviderError).retryAfterMs).toBe(65_000);
    expect(http).toHaveBeenCalledOnce();
  });

  it.each(["length", "content_filter"])("recusa conclusão %s e conteúdo inválido", async (finish_reason) => {
    const transport = new GroqTransport({ apiKey: "test-only", fetch: async () => Response.json({ choices: [{ finish_reason, message: { content: '{"answer":4}' } }] }) });
    await expect(transport.structured("x", "y", "answer", {})).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("recusa entradas grandes antes da rede e cancela requests travados", async () => {
    const http = vi.fn(async () => Response.json({}));
    const transport = new GroqTransport({ apiKey: "test-only", fetch: http, maxInputTokens: 10 });
    await expect(transport.structured("x".repeat(100), "y", "answer", {})).rejects.toMatchObject({ code: "input_too_large" });
    expect(http).not.toHaveBeenCalled();
    const timeout = new GroqTransport({ apiKey: "test-only", timeoutMs: 20, fetch: async (_url, init) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("secret")))) });
    await expect(timeout.structured("x", "y", "answer", {})).rejects.toMatchObject({ code: "timeout", retryable: true });
  });
});
