import { AiProviderError } from "./groq-transport.js";

export type CapacityDecision = { allowed: boolean; retryAfterMs?: number };
export interface GroqCapacity {
  reserve(id: string, tokens: number): Promise<CapacityDecision>;
  settle(id: string, actualTokens?: number, cooldownMs?: number): Promise<void>;
}
type Reservation = { at: number; tokens: number; inflightUntil: number; settled: boolean };

/** Single-process development only. Hosted workers must use the PostgreSQL adapter. */
export class MemoryGroqCapacity implements GroqCapacity {
  private readonly entries = new Map<string, Reservation>();
  private cooldownUntil = 0;
  constructor(private readonly options: { now?: () => number; tokensPerMinute?: number; tokensPerDay?: number } = {}) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  async reserve(id: string, tokens: number): Promise<CapacityDecision> {
    const now = this.now();
    if (!Number.isInteger(tokens) || tokens <= 0 || tokens > (this.options.tokensPerMinute ?? 8000)) throw new AiProviderError("input_too_large");
    for (const [id, value] of this.entries) if (value.at <= now - 86_400_000) this.entries.delete(id);
    if (this.entries.has(id)) return { allowed: true };
    const all = [...this.entries.values()];
    const minute = all.filter(v => v.at > now - 60_000);
    const inflight = all.filter(v => v.inflightUntil > now);
    let delay = Math.max(0, this.cooldownUntil - now, ...inflight.map(v => v.inflightUntil - now));
    if (minute.length >= 30 || minute.reduce((n, v) => n + v.tokens, 0) + tokens > (this.options.tokensPerMinute ?? 8000))
      delay = Math.max(delay, (minute[0]?.at ?? now) + 60_000 - now);
    if (all.length >= 1000 || all.reduce((n, v) => n + v.tokens, 0) + tokens > (this.options.tokensPerDay ?? 200000))
      delay = Math.max(delay, (all[0]?.at ?? now) + 86_400_000 - now);
    if (delay > 0) return { allowed: false, retryAfterMs: Math.max(1000, delay) };
    this.entries.set(id, { at: now, tokens, inflightUntil: now + 120_000, settled: false });
    return { allowed: true };
  }
  async settle(id: string, actualTokens?: number, cooldownMs = 0) {
    const entry = this.entries.get(id);
    if (entry && !entry.settled) {
      // Unknown usage keeps the full reservation; an HTTP error is not a free request.
      if (Number.isFinite(actualTokens) && actualTokens! >= 0) entry.tokens = Math.ceil(actualTokens!);
      entry.inflightUntil = 0;
      entry.settled = true;
    }
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + cooldownMs);
  }
}

const shared = globalThis as typeof globalThis & { __silogiumGroqCapacity?: GroqCapacity };
export function localGroqCapacity() { return shared.__silogiumGroqCapacity ??= new MemoryGroqCapacity(); }
