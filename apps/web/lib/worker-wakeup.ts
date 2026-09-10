type WakeEnvironment = Readonly<Record<string, string | undefined>>;
export type WorkerWakeResult = "disabled" | "notified" | "deferred";

/** A content-free hint after the queue commit, never the durable job itself.
 * Failure is deliberately non-fatal: the Modal recovery sweep reads PostgreSQL.
 */
export async function wakeAuthoringWorker(options: {
  environment?: WakeEnvironment;
  fetch?: typeof fetch;
} = {}): Promise<WorkerWakeResult> {
  const environment = options.environment ?? process.env;
  if (environment.SILOGIUM_AUTHORING_ENABLED !== "true") return "disabled";
  const endpoint = environment.SILOGIUM_WORKER_WAKE_URL?.trim();
  const token = environment.SILOGIUM_WORKER_WAKE_TOKEN?.trim();
  if (!endpoint || !token) return "disabled";
  try {
    const url = new URL(endpoint);
    // Configuration mistakes must not send a bearer secret to arbitrary hosts.
    if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*\.modal\.run$/.test(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash
      || !/^[A-Za-z0-9_-]{32,512}$/.test(token)) return "deferred";
    const response = await (options.fetch ?? fetch)(url.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    // Never retain a proxy's response body or expose it to the end user.
    await response.body?.cancel();
    return response.status === 202 ? "notified" : "deferred";
  } catch {
    return "deferred";
  }
}
