import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { JobWork } from "./durable-jobs.js";
import { AiProviderError } from "./groq-transport.js";

export type AiPhase = "definition" | "code" | "cases" | "search" | "validation" | "repair" | "waiting";
export type AiRepairBudget = { owner?: string };
const context = new AsyncLocalStorage<{ work?: JobWork; prefix: string; progress?: (phase: AiPhase) => Promise<void>; budget: AiRepairBudget }>();
export function withAiWork<T>(work: JobWork | undefined, prefix: string, compute: () => Promise<T>, progress?: (phase: AiPhase) => Promise<void>, budget: AiRepairBudget = {}) {
  return context.run({ work, prefix, progress, budget }, compute);
}
export function withStandaloneAiWork<T>(compute: () => Promise<T>) {
  return context.getStore() ? compute() : withAiWork(undefined, "standalone", compute);
}
export async function claimFormatCorrection(input: string): Promise<boolean> {
  const current = context.getStore();
  const key = createHash("sha256").update(`${current?.prefix}:${input}`).digest("hex");
  if (current?.work) return await current.work.step("groq-format-correction", async () => key) === key;
  if (!current) return true;
  current.budget.owner ??= key;
  return current.budget.owner === key;
}

/** Checkpoint each successful HTTP phase, never a partial/invalid provider response. */
export async function aiStep<T>(phase: AiPhase, input: string, compute: () => Promise<T>): Promise<T> {
  const current = context.getStore();
  const progress = current?.work?.progress ?? current?.progress;
  const key = `${current?.prefix ?? "ai"}-${phase}-${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
  const run = async () => {
    // Durable workers defer instead of sleeping. Integrated local mode retains this request for up to ten minutes.
    const deadline = Date.now() + 600_000;
    for (;;) {
      await progress?.(phase);
      try { return await compute(); }
      catch (error) {
        if (current?.work || !(error instanceof AiProviderError) || error.code !== "rate_limit"
          || Date.now() + error.retryAfterMs >= deadline) throw error;
        await progress?.("waiting");
        await delay(Math.max(1000, error.retryAfterMs));
      }
    }
  };
  return current?.work ? current.work.step(key, run) : run();
}
