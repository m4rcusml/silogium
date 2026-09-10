import { expect, it } from "vitest";
import { MemoryGroqCapacity } from "../src/groq-capacity.js";

it("shares admission across callers, accounts actual tokens and releases only after settlement", async () => {
  let now = 0;
  const budget = new MemoryGroqCapacity({ now: () => now, tokensPerMinute: 8000, tokensPerDay: 10000 });
  expect(await budget.reserve("a", 5000)).toEqual({ allowed: true });
  expect((await budget.reserve("b", 3000)).allowed).toBe(false);
  await budget.settle("a", 4000);
  await budget.settle("a", 0); // settlement replay cannot free the tokens
  expect(await budget.reserve("b", 3000)).toEqual({ allowed: true });
  await budget.settle("b", 3500);
  expect((await budget.reserve("c", 1000)).allowed).toBe(false);
  now = 60001;
  expect(await budget.reserve("c", 1000)).toEqual({ allowed: true });
  await budget.settle("c", 1000, 65000);
  expect((await budget.reserve("d", 1000)).retryAfterMs).toBe(65000);
  now += 65001;
  expect((await budget.reserve("d", 2000)).allowed).toBe(false); // daily, not minute
});

it("does not admit oversized requests or forget unresolved reservations on process-local concurrency", async () => {
  const budget = new MemoryGroqCapacity();
  await expect(budget.reserve("x", 9000)).rejects.toThrow(/contexto/);
  const results = await Promise.all([budget.reserve("a", 1000), budget.reserve("b", 1000)]);
  expect(results.filter(r => r.allowed)).toHaveLength(1);
});
