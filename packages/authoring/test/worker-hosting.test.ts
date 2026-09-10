import { describe, expect, it, vi } from "vitest";
import { drainAuthoringWorker } from "../../../infra/worker/loop.js";
import { wakeAuthoringWorker } from "../../../apps/web/lib/worker-wakeup.js";

const environment = {
  SILOGIUM_AUTHORING_ENABLED: "true",
  SILOGIUM_WORKER_WAKE_URL: "https://owner--silogium-authoring-wake.modal.run",
  SILOGIUM_WORKER_WAKE_TOKEN: "test_token_never_a_real_credential_0001",
};

describe("worker bounded drain", () => {
  it("exits immediately on an empty queue without an idle timer", async () => {
    const runOnce = vi.fn(async () => "idle" as const);
    expect(await drainAuthoringWorker({ runOnce })).toEqual({ runs: 1, reason: "idle" });
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("drains ready jobs, then exits while a capacity deferral waits in PostgreSQL", async () => {
    const runOnce = vi.fn<() => Promise<"completed" | "retry" | "idle">>()
      .mockResolvedValueOnce("completed").mockResolvedValueOnce("retry").mockResolvedValueOnce("idle");
    const onResult = vi.fn();
    expect(await drainAuthoringWorker({ runOnce }, { onResult })).toEqual({ runs: 3, reason: "idle" });
    expect(onResult.mock.calls.map(([status]) => status)).toEqual(["completed", "retry", "idle"]);
  });

  it("does not make another claim after its time or claim budget", async () => {
    let time = 0;
    const runOnce = vi.fn(async () => { time += 20; return "completed" as const; });
    expect(await drainAuthoringWorker({ runOnce }, { now: () => time, maxStartMs: 30 }))
      .toEqual({ runs: 2, reason: "bounded" });
    expect(await drainAuthoringWorker({ runOnce }, { maxRuns: 1 })).toEqual({ runs: 1, reason: "bounded" });
  });

  it("finishes the active job but does not start another after SIGTERM", async () => {
    let stopping = false;
    const runOnce = vi.fn(async () => { stopping = true; return "completed" as const; });
    expect(await drainAuthoringWorker({ runOnce }, { stopping: () => stopping })).toEqual({ runs: 1, reason: "stopping" });
    expect(runOnce).toHaveBeenCalledTimes(1);
    await expect(drainAuthoringWorker({ runOnce }, { maxRuns: 0 })).rejects.toThrow("Limites");
  });
});

describe("content-free worker wake notification", () => {
  it("sends only the server bearer secret to the configured Modal endpoint", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"scheduled"}', { status: 202 }));
    expect(await wakeAuthoringWorker({ environment, fetch: request })).toBe("notified");
    expect(request).toHaveBeenCalledWith(`${environment.SILOGIUM_WORKER_WAKE_URL}/`, {
      method: "POST", headers: { authorization: `Bearer ${environment.SILOGIUM_WORKER_WAKE_TOKEN}` },
      redirect: "error", cache: "no-store", signal: expect.any(AbortSignal),
    });
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("missing/disabled configuration performs no network request", async () => {
    const request = vi.fn<typeof fetch>();
    expect(await wakeAuthoringWorker({ environment: {}, fetch: request })).toBe("disabled");
    expect(await wakeAuthoringWorker({ environment: { ...environment, SILOGIUM_AUTHORING_ENABLED: "false" }, fetch: request })).toBe("disabled");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    "http://owner.modal.run", "https://evil.test/wake", "https://owner.modal.run.evil.test",
    "https://user:password@owner.modal.run", "https://owner.modal.run?token=secret", "https://owner.modal.run/#fragment",
  ])("does not send credentials to unsafe configuration %s", async (endpoint) => {
    const request = vi.fn<typeof fetch>();
    expect(await wakeAuthoringWorker({ environment: { ...environment, SILOGIUM_WORKER_WAKE_URL: endpoint }, fetch: request })).toBe("deferred");
    expect(request).not.toHaveBeenCalled();
  });

  it("timeout and errors defer to the recovery sweep without leaking a response", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret provider details"));
    expect(await wakeAuthoringWorker({ environment, fetch: request })).toBe("deferred");
    request.mockResolvedValue(new Response("secret infrastructure details", { status: 503 }));
    expect(await wakeAuthoringWorker({ environment, fetch: request })).toBe("deferred");
  });
});
