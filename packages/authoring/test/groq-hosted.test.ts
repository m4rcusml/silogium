import { expect, it, vi } from "vitest";
import { SupabaseGroqCapacity } from "../../../apps/web/lib/supabase/groq-capacity.js";
import { GroqTransport } from "../src/groq-transport.js";
import { MemoryGroqCapacity } from "../src/groq-capacity.js";

it("does not call Groq if shared capacity or the database is unavailable", async () => {
  const http = vi.fn();
  const rpc = vi.fn(async () => ({ data: { allowed: false, retryAfterMs: 65000 }, error: null }));
  const transport = new GroqTransport({ apiKey: "private-secret", fetch: http, capacity: new SupabaseGroqCapacity(() => ({ rpc })) });
  await expect(transport.completion("test", "data")).rejects.toMatchObject({ code: "rate_limit", retryAfterMs: 65000 });
  expect(http).not.toHaveBeenCalled();
  expect(JSON.stringify(rpc.mock.calls)).not.toContain("private-secret");
  expect(rpc).toHaveBeenCalledWith("groq_capacity", { p_action: "reserve", p_payload: { id: expect.any(String), tokens: expect.any(Number) } });
  const offline = new GroqTransport({ apiKey: "private-secret", fetch: http, capacity: new SupabaseGroqCapacity(() => null) });
  await expect(offline.completion("test", "data")).rejects.toMatchObject({ code: "unavailable" });
  expect(http).not.toHaveBeenCalled();
});

it("retains unknown usage but releases concurrency after timeout", async () => {
  const capacity = new MemoryGroqCapacity();
  const transport = new GroqTransport({ apiKey: "test", timeoutMs: 20, capacity,
    fetch: async (_url, init) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("private")))) });
  await expect(transport.completion("test", "data")).rejects.toMatchObject({ code: "timeout" });
  expect((await capacity.reserve("next", 1000)).allowed).toBe(true);
});
