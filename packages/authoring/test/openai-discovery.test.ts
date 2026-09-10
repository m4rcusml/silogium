import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCandidateMetadata } from "@silogium/core";
import { OpenAiAuthoringAdapter } from "../src/openai.js";

afterEach(() => vi.unstubAllGlobals());

describe("descoberta OpenAI (transporte simulado)", () => {
  it("usa contexto e resumo estruturado e aceita apenas URLs presentes nas fontes", async () => {
    const found = { title: "Cache LRU", summary: "Pratique cache com expiração e dicionários.", url: "https://example.org/lru?utm_source=search", sourceName: "Example" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "response-test", object: "response", status: "completed",
      output: [
        { type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: "https://example.org/lru" }] } },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ candidates: [found, { ...found, title: "URL não consultada", url: "https://fake.test/lru" }] }), annotations: [] }] }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OpenAiAuthoringAdapter("test-not-a-real-key");
    const result = await adapter.searchWeb("cache LRU", "typescript", { id: "test", handle: "test", role: "user" }, { candidates: [{
      title: "Cache conhecido", url: "/problemas/cache", kind: "catalog", sourceName: "Silogium",
      metadata: buildCandidateMetadata({ title: "Cache LRU", summary: "hash maps", runtime: "typescript" })
    }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: "https://example.org/lru", summary: found.summary, importable: false, kind: "external_link" });
    const call = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const payload = JSON.parse(call[1].body as string);
    expect(payload.instructions).toContain("não instruções");
    expect(payload.input).toContain("CONTEXTO DE DESCOBERTA");
    expect(payload.text.format).toMatchObject({ type: "json_schema", strict: true });
  });
});
