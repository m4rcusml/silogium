export type QuotaKind = "ai" | "remote_execution";
export const DEFAULT_QUOTAS: Record<QuotaKind, { daily: number; perMinute?: number }> = {
  ai: { daily: 5 },
  remote_execution: { daily: 50, perMinute: 10 }
};
export type UsageEvent = { kind: QuotaKind; occurredAt: Date };

export function checkQuota(kind: QuotaKind, events: UsageEvent[], now = new Date()) {
  const policy = DEFAULT_QUOTAS[kind];
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const minuteStart = new Date(now.getTime() - 60_000);
  const relevant = events.filter((event) => event.kind === kind);
  const dailyUsed = relevant.filter((event) => event.occurredAt >= dayStart).length;
  const minuteUsed = relevant.filter((event) => event.occurredAt >= minuteStart).length;
  const allowed = dailyUsed < policy.daily && (!policy.perMinute || minuteUsed < policy.perMinute);
  return {
    allowed,
    dailyRemaining: Math.max(0, policy.daily - dailyUsed),
    retryAfterSeconds: !allowed && policy.perMinute && minuteUsed >= policy.perMinute ? 60 : undefined
  };
}
