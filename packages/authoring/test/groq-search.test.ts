import { expect, it, vi } from "vitest";
import { GroqAuthoringAdapter } from "../src/groq.js";

const actor = { id: "test-user", handle: "test", role: "user" as const };
const candidate = { title: "Anagram", summary: "Agrupe palavras pelas letras que possuem.", url: "https://exercism.org/tracks/typescript/exercises/anagram", sourceName: "Exercism" };
const response = (message: object) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message }] }));

it("web is opt-in and never falls back to another model or an ungrounded URL", async () => {
  const http = vi.fn(async (_url, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    expect(JSON.stringify(body)).not.toContain("PRIVATE_SENTINEL");
    expect(body.model).toBe("openai/gpt-oss-120b");
    if (body.tools) {
      expect(body.response_format).toBeUndefined();
      expect(body.citation_options).toBeUndefined();
      return response({ content: "achei", executed_tools: [{ type: "browser_search", search_results: { results: [candidate] } }] });
    }
    expect(body.response_format.type).toBe("json_schema");
    return response({ content: JSON.stringify({ candidates: [candidate, { ...candidate, url: "https://invented.example.com/problem" }] }) });
  });
  const adapter = new GroqAuthoringAdapter({ apiKey: "test-key", fetch: http, webSearch: true });
  const results = await adapter.searchWeb("anagramas em arrays", "typescript", actor,
    { candidates: [{ title: "PRIVATE_SENTINEL", kind: "catalog", sourceName: "Silogium", url: "/private" }] });
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ kind: "external_link", importable: false, url: candidate.url });
  expect(results[0]).not.toHaveProperty("licenseSpdx");
  expect(http).toHaveBeenCalledTimes(2);
  await adapter.searchWeb("anagramas em arrays", "typescript", actor);
  expect(http).toHaveBeenCalledTimes(2); // bounded private per-actor cache
  expect(await new GroqAuthoringAdapter({ apiKey: "test-key", fetch: http }).searchWeb("anagramas", "typescript", actor)).toEqual([]);
  expect(http).toHaveBeenCalledTimes(2);
});

it("ignores plain-text URLs and never formats results without actual tool evidence", async () => {
  const http = vi.fn(async () => response({ content: candidate.url }));
  const adapter = new GroqAuthoringAdapter({ apiKey: "test-key", fetch: http, webSearch: true });
  expect(await adapter.searchWeb("anagramas", "typescript", actor)).toEqual([]);
  expect(http).toHaveBeenCalledTimes(1);
});
