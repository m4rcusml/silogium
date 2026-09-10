import { describe, expect, it, vi } from "vitest";
vi.mock("../../../apps/web/lib/supabase/admin.js", () => ({ createSupabaseAdminClient: () => null }));
import { consumeQuota, refundQuota } from "../../../apps/web/lib/usage.js";

describe("cota local de operações", () => {
  it("permite todas as cinco operações e só bloqueia a sexta", async () => {
    const user = crypto.randomUUID();
    for (let index = 0; index < 5; index += 1) {
      expect(await consumeQuota(user, "ai")).toMatchObject({ allowed: true, dailyRemaining: 4 - index });
    }
    expect(await consumeQuota(user, "ai")).toMatchObject({ allowed: false, dailyRemaining: 0 });
    await refundQuota(user, "ai");
    expect(await consumeQuota(user, "ai")).toMatchObject({ allowed: true, dailyRemaining: 0 });
  });

  it("permite a décima execução por minuto antes de bloquear", async () => {
    const user = crypto.randomUUID();
    for (let index = 0; index < 10; index += 1) expect((await consumeQuota(user, "remote_execution")).allowed).toBe(true);
    expect(await consumeQuota(user, "remote_execution")).toMatchObject({ allowed: false, retryAfterSeconds: 60 });
  });
});
