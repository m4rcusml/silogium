/** Hosting policy only; claiming, checkpoints and leases belong to AuthoringWorker. */
export type WorkerRunStatus = "idle" | "completed" | "retry" | "lease_lost";
export type WorkerLoopResult = { runs: number; reason: "idle" | "bounded" | "stopping" };

export async function drainAuthoringWorker(
  worker: { runOnce(): Promise<WorkerRunStatus> },
  options: {
    now?: () => number;
    stopping?: () => boolean;
    onResult?: (status: WorkerRunStatus) => void;
    maxRuns?: number;
    maxStartMs?: number;
  } = {},
): Promise<WorkerLoopResult> {
  const maxRuns = options.maxRuns ?? 25;
  const maxStartMs = options.maxStartMs ?? 360_000;
  if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 100
    || !Number.isFinite(maxStartMs) || maxStartMs <= 0 || maxStartMs > 720_000) {
    throw new Error("Limites de drenagem inválidos.");
  }
  const now = options.now ?? Date.now;
  const startedAt = now();
  let runs = 0;
  // The time budget prevents new claims; it does not abandon an active lease.
  // Modal's hard lifetime recovers a stuck in-flight claim through lease expiry.
  while (runs < maxRuns && now() - startedAt < maxStartMs) {
    if (options.stopping?.()) return { runs, reason: "stopping" };
    const status = await worker.runOnce();
    runs += 1;
    options.onResult?.(status);
    // Capacity deferrals update available_at. The next claim is idle if there is
    // no other ready work, so waiting for a quota never keeps this process alive.
    if (status === "idle") return { runs, reason: "idle" };
  }
  return { runs, reason: "bounded" };
}
