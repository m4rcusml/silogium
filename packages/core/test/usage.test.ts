import { describe, expect, it, vi } from "vitest";
vi.mock("../../../apps/web/lib/supabase/admin.js", () => ({ createSupabaseAdminClient: () => null }));
import { consumeQuota, refundQuota } from "../../../apps/web/lib/usage.js";

describe("cota local de operações", () => {
  it("devolve uma execução quando a infraestrutura falha", async () => {
    const user = crypto.randomUUID();
    for (let index = 0; index < 5; index += 1) {
      expect(await consumeQuota(user, "remote_execution")).toMatchObject({ allowed: true, dailyRemaining: 49 - index });
    }
    await refundQuota(user, "remote_execution");
    expect(await consumeQuota(user, "remote_execution")).toMatchObject({ allowed: true, dailyRemaining: 45 });
  });

  it("permite a décima execução por minuto antes de bloquear", async () => {
    const user = crypto.randomUUID();
    for (let index = 0; index < 10; index += 1) expect((await consumeQuota(user, "remote_execution")).allowed).toBe(true);
    expect(await consumeQuota(user, "remote_execution")).toMatchObject({ allowed: false, retryAfterSeconds: 60 });
  });
});
