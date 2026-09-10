import { z } from "zod";
export type CapacityService = "groq" | "modal";
export type ServiceAvailability = { available: boolean; reason?: string; retryAt?: string };
export type OperationalAvailability = Record<CapacityService, ServiceAvailability>;
export const ServiceAvailabilitySchema = z.object({ available: z.boolean(), reason: z.string().max(1000).optional(), retryAt: z.string().datetime({ offset: true }).optional() });
export const OperationalAvailabilitySchema = z.object({ groq: ServiceAvailabilitySchema, modal: ServiceAvailabilitySchema });
export const ModalReservationDecisionSchema = z.object({ allowed: z.boolean(), availability: ServiceAvailabilitySchema.optional() });

/** A recoverable infrastructure pause, never evidence that a solution is incorrect. */
export class CapacityUnavailableError extends Error {
  readonly code = "free_capacity_unavailable";
  readonly statusCode = 503;
  constructor(readonly service: CapacityService, availability: ServiceAvailability) {
    super(availability.reason ?? `A capacidade gratuita de ${service === "groq" ? "IA" : "execução"} está temporariamente indisponível.`);
    this.name = "CapacityUnavailableError";
    this.retryAt = availability.retryAt;
  }
  readonly retryAt?: string;
  retryAfterMs(now = Date.now()) {
    const reset = this.retryAt ? Date.parse(this.retryAt) : NaN;
    // Unknown renewal must not be presented as a promised time to the user.
    return Number.isFinite(reset) ? Math.min(86_400_000, Math.max(60_000, reset - now)) : 300_000;
  }
}
