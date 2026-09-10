import { freezePracticeWeek, projectPractice, summarizePracticeWeeks, type PracticeEvidence, type PracticePreferences, type PracticeWeek } from "@silogium/core";
import { createSupabaseAdminClient } from "./supabase/admin.js";
import { loadPracticeHistory } from "./executions.js";
import { summarizeProfileActivity } from "./profile-summary.js";
import { summarizeCatalogProgress } from "./catalog-progress.js";

export type PracticeSettings = {
  preferences: PracticePreferences;
  showProgress: boolean;
  weeks: PracticeWeek[];
  pending?: { preferences: PracticePreferences; effectiveAt: string };
};
type SettingsRecord = { revision: number; value: PracticeSettings };
const state = globalThis as typeof globalThis & { __silogiumPracticeSettings?: Map<string, SettingsRecord> };
const settings = state.__silogiumPracticeSettings ??= new Map<string, SettingsRecord>();
export function exportMemoryPracticeSettings() { return structuredClone([...settings]); }
const defaults = (): PracticeSettings => ({ preferences: { timeZone: "America/Sao_Paulo", goalDays: null }, showProgress: true, weeks: [] });

/** Immutable windows, including a neutral transition boundary when moving timezones.
 * A clipped start gives already-counted hours to the old week, never both weeks.
 */
export function advancePracticeSettings(userId: string, value: PracticeSettings, now: string): PracticeSettings {
  const next = structuredClone(value);
  let previous = next.weeks.at(-1);
  if (previous && Date.parse(now) < Date.parse(previous.endsAt)) return next;
  if (next.pending && Date.parse(now) >= Date.parse(next.pending.effectiveAt)) { next.preferences = next.pending.preferences; delete next.pending; }
  let fresh = freezePracticeWeek({ userId, at: now, preferences: next.preferences });
  if (previous && fresh.weekStart <= previous.weekStart && fresh.timeZone !== previous.timeZone) {
    // Moving west can still be Sunday in the new zone. Start on its next Monday;
    // the short neutral interval remains personal history, with no duplicate goal.
    fresh = freezePracticeWeek({ userId, at: fresh.endsAt, preferences: next.preferences });
  }
  if (previous && Date.parse(fresh.startsAt) < Date.parse(previous.endsAt)) fresh.countFrom = previous.endsAt;
  next.weeks.push(fresh);
  return next;
}

async function readSettings(userId: string): Promise<SettingsRecord> {
  const admin = createSupabaseAdminClient();
  if (!admin) return structuredClone(settings.get(userId) ?? { revision: 0, value: defaults() });
  const { data, error } = await admin.from("practice_settings").select("revision,settings").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Não foi possível ler sua meta. Aplique a migração de prática. ${error.message}`);
  return data ? { revision: data.revision, value: data.settings as PracticeSettings } : { revision: 0, value: defaults() };
}

async function writeSettings(userId: string, previous: SettingsRecord, value: PracticeSettings) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    if ((settings.get(userId)?.revision ?? 0) !== previous.revision) return false;
    settings.set(userId, { revision: previous.revision + 1, value: structuredClone(value) });
    return true;
  }
  const { data, error } = await admin.rpc("save_practice_settings", { requested_user: userId, expected_revision: previous.revision, new_settings: value });
  if (error) throw new Error(`Não foi possível salvar sua meta: ${error.message}`);
  return data === true;
}

export async function getPracticeSettings(userId: string, now = new Date().toISOString()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const stored = await readSettings(userId);
    const next = advancePracticeSettings(userId, stored.value, now);
    if (JSON.stringify(next) === JSON.stringify(stored.value) || await writeSettings(userId, stored, next)) return next;
  }
  throw new Error("Sua meta foi alterada em outra janela. Atualize a página.");
}

export async function updatePracticeSettings(userId: string, input: { timeZone: string; goalDays: number | null; showProgress: boolean }, now = new Date().toISOString()) {
  // The constructor validates the zone and bounds before any storage mutation.
  const validated = freezePracticeWeek({ userId, at: now, preferences: input });
  const preferences = { timeZone: validated.timeZone, goalDays: validated.goalDays };
  if (typeof input.showProgress !== "boolean") throw new Error("Preferência de exibição inválida.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const stored = await readSettings(userId);
    const next = advancePracticeSettings(userId, stored.value, now);
    next.showProgress = input.showProgress;
    const current = next.weeks.at(-1)!;
    if (preferences.goalDays === next.preferences.goalDays && preferences.timeZone === next.preferences.timeZone) delete next.pending;
    else next.pending = { preferences, effectiveAt: current.endsAt };
    if (await writeSettings(userId, stored, next)) return next;
  }
  throw new Error("Sua meta foi alterada em outra janela. Tente novamente.");
}

export async function getPracticeOverview(userId: string) {
  const [history, configuration] = await Promise.all([loadPracticeHistory(userId), getPracticeSettings(userId)]);
  const evidence = history.flatMap((item) => item.evidence ? [item.evidence] : []);
  const projection = projectPractice({ userId, evidence, historyComplete: true });
  const legacy = history.filter((item) => !item.evidence && item.request.kind === "submission").length;
  const mode = createSupabaseAdminClient() ? "persistent" as const : "demo" as const;
  const weeks = summarizePracticeWeeks(projection, configuration.weeks);
  // Immutable raw evidence/outbox remains the source of truth. On-demand rebuilds
  // are replayable; a failed projection never changes a persisted judge verdict.
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.rpc("store_practice_projection", { requested_user: userId, projection: {
      ...projection, unverifiedSubmissions: projection.unverifiedSubmissions + legacy, sourceExecutionCount: history.length
    } });
    if (error) throw new Error(`Seu resultado foi salvo, mas o progresso ainda não pôde ser atualizado. ${error.message}`);
  }
  return {
    mode, historyScope: mode === "demo" ? "session" as const : "account" as const, historyComplete: true,
    activity: summarizeProfileActivity(history), totalExecutions: history.length,
    catalogProgress: summarizeCatalogProgress(history),
    summary: projection.summary, unverifiedSubmissions: projection.unverifiedSubmissions + legacy,
    // No public projection is exposed. Only the authenticated owner can call here.
    completions: projection.completions.map(({ problemId, problemVersion, runtime, occurredAt }) => ({ problemId, problemVersion, runtime, occurredAt })),
    milestones: projection.milestones.map(({ problemId, problemVersion, runtime, kind, unitId, occurredAt }) => ({ problemId, problemVersion, runtime, kind, unitId, occurredAt })),
    achievements: projection.achievements, week: weeks.at(-1) ?? null, weeks: weeks.slice(-12), preferences: configuration
  };
}
export type PracticeOverview = Awaited<ReturnType<typeof getPracticeOverview>>;
