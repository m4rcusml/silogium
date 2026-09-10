import { AiProviderError, type GroqCapacity, type CapacityDecision } from "@silogium/authoring";
import { createSupabaseAdminClient } from "./admin";
import { requireOperationalCapacity } from "../operational-capacity";

type Client = { rpc(name: string, args: { p_action: string; p_payload: unknown }): PromiseLike<{ data: unknown; error: unknown }> };

/** Fail closed if the shared ledger is unavailable. Never substitute a process-local limiter. */
export class SupabaseGroqCapacity implements GroqCapacity {
  constructor(private readonly client: () => Client | null = createSupabaseAdminClient) {}
  private async call(action: string, payload: unknown) {
    try {
      const client = this.client();
      if (!client) throw new Error();
      const response = await client.rpc("groq_capacity", { p_action: action, p_payload: payload });
      if (response.error) throw new Error();
      return response.data;
    } catch { throw new AiProviderError("unavailable", true); }
  }
  async reserve(id: string, tokens: number): Promise<CapacityDecision> {
    await requireOperationalCapacity("groq");
    if (tokens > 8000) throw new AiProviderError("input_too_large");
    const result = await this.call("reserve", { id, tokens }) as CapacityDecision | null;
    if (!result || typeof result.allowed !== "boolean" || !result.allowed && (!Number.isFinite(result.retryAfterMs) || result.retryAfterMs! <= 0)) throw new AiProviderError("unavailable", true);
    return result;
  }
  async settle(id: string, actualTokens?: number, cooldownMs?: number) {
    await this.call("settle", { id, actualTokens, cooldownMs });
  }
}
