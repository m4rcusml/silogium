import { CapacityUnavailableError } from "@silogium/core";
import { BetaAccessError } from "./beta";

export function requestFailure(error: unknown, fallback: string) {
  const status = error instanceof BetaAccessError || error instanceof CapacityUnavailableError ? error.statusCode : 400;
  return Response.json({ error: error instanceof Error ? error.message : fallback,
    ...(error instanceof BetaAccessError ? { code: error.code, beta: error.betaStatus } : {}),
    ...(error instanceof CapacityUnavailableError ? { code: error.code, service: error.service, retryAt: error.retryAt } : {})
  }, { status, headers: { "Cache-Control": "private, no-store" } });
}
