import type { Runtime, Verdict } from "./schemas.js";

/** Internal, server-produced evidence; never accept this object from a browser or CLI.
 * Persist the submission and its evidence/outbox atomically before projecting it.
 * `unitId` is a reviewed, stable learning identity, not a stage number or version.
 */
export type PracticeEvidence = {
  submissionId: string;
  userId: string;
  problemId: string;
  canonicalProblemId: string;
  problemVersion: number;
  runtime: Runtime;
  occurredAt: string;
  kind: "run" | "submission";
  verdict: Verdict;
  purpose: "practice" | "reference" | "validation" | "smoke_test";
  problem: {
    format: "classic" | "progressive";
    origin: "native" | "licensed_import" | "external_link";
    visibility: "private" | "unlisted" | "public";
    catalogReviewed: boolean;
    authorId?: string;
    requestedBy?: string;
  };
  verification:
    | { kind: "demo" | "local" | "legacy_unverified" }
    | {
      kind: "official";
      judgePolicyVersion: string;
      bundleRevision: string;
      bundleComplete: boolean;
      bundleReviewed: boolean;
      scope: "complete" | "partial";
      requiredStages: readonly number[];
      stages: readonly { number: number; passed: boolean; fullyEvaluated: boolean; unitId?: string }[];
    };
};

type EvidenceReference = Pick<PracticeEvidence, "userId" | "problemId" | "canonicalProblemId" | "problemVersion" | "runtime" | "submissionId" | "occurredAt"> & {
  judgePolicyVersion: string;
  bundleRevision: string;
  format: "classic" | "progressive";
  catalogReviewed: boolean;
  publicEligible: boolean;
};

export type PracticeMilestone = EvidenceReference & {
  key: string;
  kind: "problem_completed" | "stage_completed";
  unitId?: string;
};

export type PracticeCompletion = EvidenceReference;
export type PracticeAchievement = {
  id: "first_solution" | "step_by_step" | "two_languages" | "five_catalog_problems";
  title: string;
  criterion: string;
  awardedAt: string;
};

/** All fields are a PRIVATE projection. Public eligibility is not consent to publish.
 * Public delivery additionally requires opt-in and current visibility authorization.
 * Never send the ledger or its submission references to another user's profile.
 */
export type PracticeProjection = {
  userId: string;
  historyComplete: boolean;
  unverifiedSubmissions: number;
  completions: PracticeCompletion[];
  milestones: PracticeMilestone[];
  achievements: PracticeAchievement[];
  publicEligibleAchievements: PracticeAchievement[];
  summary: {
    distinctProblems: number;
    byRuntime: Record<Runtime, number>;
  };
};

function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("A evidência precisa de uma data ISO com fuso horário.");
  }
  return Date.parse(value);
}

function order(left: { occurredAt: string; submissionId: string }, right: { occurredAt: string; submissionId: string }) {
  return instant(left.occurredAt) - instant(right.occurredAt) || left.submissionId.localeCompare(right.submissionId, "en");
}

function validOfficial(evidence: PracticeEvidence): evidence is PracticeEvidence & { verification: Extract<PracticeEvidence["verification"], { kind: "official" }> } {
  const verification = evidence.verification;
  if (verification.kind !== "official" || !verification.bundleComplete || !verification.judgePolicyVersion.trim() || !verification.bundleRevision.trim()) return false;
  const required = verification.requiredStages;
  const seen = new Set(verification.stages.map((stage) => stage.number));
  return required.length > 0 && required.length <= 4
    && (evidence.problem.format === "classic" ? required.length === 1 : required.length >= 2)
    && required.every((number) => Number.isInteger(number) && number > 0)
    && new Set(required).size === required.length
    && seen.size === verification.stages.length
    && verification.stages.every((stage) => required.includes(stage.number));
}

function achievementList(milestones: readonly PracticeMilestone[]): PracticeAchievement[] {
  const completions = milestones.filter((milestone) => milestone.kind === "problem_completed");
  const achievements: PracticeAchievement[] = [];
  const first = completions[0];
  if (first) achievements.push({ id: "first_solution", title: "Primeira solução", criterion: "Concluir uma questão em uma submissão oficial completa aceita.", awardedAt: first.occurredAt });
  const progressive = completions.find((milestone) => milestone.format === "progressive");
  if (progressive) achievements.push({ id: "step_by_step", title: "Etapa por etapa", criterion: "Concluir todos os estágios de uma questão progressiva na mesma submissão oficial.", awardedAt: progressive.occurredAt });
  const languages = new Set<Runtime>();
  const catalogProblems = new Set<string>();
  for (const completion of completions) {
    languages.add(completion.runtime);
    if (languages.size === 2 && !achievements.some((achievement) => achievement.id === "two_languages")) {
      achievements.push({ id: "two_languages", title: "Duas linguagens", criterion: "Concluir uma questão em TypeScript e uma em Python; pode ser a mesma questão.", awardedAt: completion.occurredAt });
    }
    if (completion.catalogReviewed) catalogProblems.add(completion.canonicalProblemId);
    if (catalogProblems.size === 5 && !achievements.some((achievement) => achievement.id === "five_catalog_problems")) {
      achievements.push({ id: "five_catalog_problems", title: "Repertório em construção", criterion: "Concluir cinco questões canônicas distintas do catálogo revisado.", awardedAt: completion.occurredAt });
    }
  }
  return achievements.sort((left, right) => instant(left.awardedAt) - instant(right.awardedAt) || left.id.localeCompare(right.id, "en"));
}

/** Rebuild from all available evidence, without the UI's 100-item history limit.
 * Out-of-order delivery and identical replay are deterministic. Conflicting reuse of
 * a submission ID fails closed. A database consumer still needs unique constraints
 * and a transaction: this pure projection does not provide persistence/concurrency.
 */
export function projectPractice(input: { userId: string; evidence: readonly PracticeEvidence[]; historyComplete: boolean }): PracticeProjection {
  if (!input.userId.trim()) throw new Error("Usuário obrigatório.");
  const submissions = new Map<string, PracticeEvidence>();
  for (const evidence of input.evidence) {
    if (evidence.userId !== input.userId) continue;
    if (![evidence.submissionId, evidence.problemId, evidence.canonicalProblemId].every((value) => value.trim())
      || !Number.isInteger(evidence.problemVersion) || evidence.problemVersion < 1
      || !["typescript", "python"].includes(evidence.runtime)) throw new Error("Identidade da evidência inválida.");
    instant(evidence.occurredAt);
    const existing = submissions.get(evidence.submissionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(evidence)) throw new Error("Evidências conflitantes para a mesma submissão.");
    submissions.set(evidence.submissionId, evidence);
  }
  const ordered = [...submissions.values()].sort(order);
  const milestones = new Map<string, PracticeMilestone>();
  const completions = new Map<string, PracticeCompletion>();
  let unverifiedSubmissions = 0;
  for (const evidence of ordered) {
    if (evidence.kind !== "submission" || evidence.purpose !== "practice" || evidence.verdict === "system_error") continue;
    if (evidence.verification.kind !== "official") { unverifiedSubmissions++; continue; }
    if (evidence.problem.origin === "external_link" || !validOfficial(evidence)) { unverifiedSubmissions++; continue; }
    if (evidence.verdict !== "accepted" && evidence.verdict !== "wrong_answer") continue;
    const verified = evidence.verification;
    const catalogReviewed = evidence.problem.catalogReviewed && evidence.problem.visibility === "public";
    const publicEligible = catalogReviewed && verified.bundleReviewed
      && (evidence.problem.origin !== "native" || (Boolean(evidence.problem.authorId?.trim()) && evidence.problem.authorId !== evidence.userId && evidence.problem.requestedBy !== evidence.userId));
    const reference: EvidenceReference = {
      userId: evidence.userId, problemId: evidence.problemId, canonicalProblemId: evidence.canonicalProblemId,
      problemVersion: evidence.problemVersion, runtime: evidence.runtime, submissionId: evidence.submissionId,
      occurredAt: new Date(instant(evidence.occurredAt)).toISOString(), judgePolicyVersion: verified.judgePolicyVersion,
      bundleRevision: verified.bundleRevision, format: evidence.problem.format, catalogReviewed, publicEligible
    };
    const record = (kind: PracticeMilestone["kind"], unitId?: string) => {
      const key = JSON.stringify([evidence.userId, evidence.canonicalProblemId, evidence.runtime, kind, unitId ?? null]);
      // First eligibility is immutable: a later publication/version is not a backfill award.
      if (!milestones.has(key)) milestones.set(key, { ...reference, key, kind, ...(unitId ? { unitId } : {}) });
    };
    if (evidence.problem.format === "progressive") {
      for (const stage of verified.stages) {
        if (stage.fullyEvaluated && stage.passed && stage.unitId?.trim()) record("stage_completed", stage.unitId);
      }
    }
    const complete = verified.scope === "complete" && evidence.verdict === "accepted"
      && verified.requiredStages.every((number) => verified.stages.some((stage) => stage.number === number && stage.fullyEvaluated && stage.passed));
    if (complete) {
      const key = JSON.stringify([evidence.userId, evidence.problemId, evidence.problemVersion, evidence.runtime]);
      if (!completions.has(key)) completions.set(key, reference);
      record("problem_completed");
    }
  }
  const ledger = [...milestones.values()];
  const completed = ledger.filter((milestone) => milestone.kind === "problem_completed");
  return {
    userId: input.userId, historyComplete: input.historyComplete, unverifiedSubmissions,
    completions: [...completions.values()], milestones: ledger,
    // A partial window cannot establish a first achievement date or final totals.
    achievements: input.historyComplete ? achievementList(ledger) : [],
    publicEligibleAchievements: input.historyComplete ? achievementList(ledger.filter((milestone) => milestone.publicEligible)) : [],
    summary: {
      distinctProblems: new Set(completed.map((milestone) => milestone.canonicalProblemId)).size,
      byRuntime: {
        typescript: completed.filter((milestone) => milestone.runtime === "typescript").length,
        python: completed.filter((milestone) => milestone.runtime === "python").length
      }
    }
  };
}

export type PracticePreferences = { timeZone: string; goalDays: number | null };
export type PracticeWeek = { userId: string; weekStart: string; timeZone: string; goalDays: number | null; startsAt: string; endsAt: string; countFrom?: string };
export type PracticeWeekProgress = PracticeWeek & { historyComplete: boolean; days: string[]; progressDays: number; status: "disabled" | "incomplete_history" | "in_progress" | "met" };

function dateFormatter(timeZone: string) {
  if (timeZone !== "UTC" && !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timeZone)) throw new Error("Escolha um fuso IANA válido.");
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { throw new Error("Escolha um fuso IANA válido."); }
}

function dateAt(value: number, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(value);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfDate(value: string, formatter: Intl.DateTimeFormat): string {
  // Find the first instant of the local date, including DST midnight transitions.
  const center = Date.parse(`${value}T00:00:00.000Z`);
  let lower = center - 36 * 3_600_000;
  let upper = center + 36 * 3_600_000;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (dateAt(middle, formatter) < value) lower = middle + 1;
    else upper = middle;
  }
  if (dateAt(lower, formatter) !== value) throw new Error("Esta data não existe no fuso escolhido.");
  return new Date(lower).toISOString();
}

function validateGoal(value: number | null) {
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 7)) throw new Error("A meta deve ser de um a sete dias, ou desativada.");
}

/** Persist once per week; pass the stored snapshot on subsequent reads. Preference
 * changes cannot rewrite it. Schedule the next week's preferences in storage.
 * A timezone transition must not create overlapping persisted weeks (checked below).
 */
export function freezePracticeWeek(input: { userId: string; at: string; preferences: PracticePreferences }, existing?: PracticeWeek): PracticeWeek {
  const at = instant(input.at);
  if (!input.userId.trim()) throw new Error("Usuário obrigatório.");
  if (existing) {
    if (existing.userId !== input.userId || at < instant(existing.startsAt) || at >= instant(existing.endsAt)) throw new Error("O snapshot não pertence à semana solicitada.");
    validateWeek(existing);
    return { ...existing };
  }
  validateGoal(input.preferences.goalDays);
  const formatter = dateFormatter(input.preferences.timeZone);
  const date = dateAt(at, formatter);
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const weekStart = addDays(date, -((weekday + 6) % 7));
  return {
    userId: input.userId, weekStart, timeZone: formatter.resolvedOptions().timeZone, goalDays: input.preferences.goalDays,
    startsAt: startOfDate(weekStart, formatter), endsAt: startOfDate(addDays(weekStart, 7), formatter)
  };
}

function validateWeek(week: PracticeWeek) {
  validateGoal(week.goalDays);
  const formatter = dateFormatter(week.timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week.weekStart) || new Date(`${week.weekStart}T00:00:00.000Z`).getUTCDay() !== 1
    || week.startsAt !== startOfDate(week.weekStart, formatter) || week.endsAt !== startOfDate(addDays(week.weekStart, 7), formatter)) {
    throw new Error("Snapshot semanal inválido.");
  }
  if (week.countFrom && (instant(week.countFrom) < instant(week.startsAt) || instant(week.countFrom) >= instant(week.endsAt))) throw new Error("Corte semanal inválido.");
}

/** Personal progress only; never feed this result to a public profile. Empty or
 * incomplete history stays identified by PracticeProjection.historyComplete.
 * Replays/new versions do not create extra days because only first milestones count.
 */
export function summarizePracticeWeeks(projection: PracticeProjection, snapshots: readonly PracticeWeek[]): PracticeWeekProgress[] {
  const weeks = [...snapshots].sort((left, right) => instant(left.countFrom ?? left.startsAt) - instant(right.countFrom ?? right.startsAt));
  for (let index = 0; index < weeks.length; index++) {
    const week = weeks[index]!;
    validateWeek(week);
    if (week.userId !== projection.userId) throw new Error("Semana pertence a outro usuário.");
    if (index > 0 && instant(weeks[index - 1]!.endsAt) > instant(week.countFrom ?? week.startsAt)) throw new Error("Semanas sobrepostas: agende a mudança de fuso sem recontar eventos.");
  }
  return weeks.map((week) => {
    const formatter = dateFormatter(week.timeZone);
    const days = week.goalDays === null ? [] : [...new Set(projection.milestones
      .filter((milestone) => instant(milestone.occurredAt) >= instant(week.countFrom ?? week.startsAt) && instant(milestone.occurredAt) < instant(week.endsAt))
      .map((milestone) => dateAt(instant(milestone.occurredAt), formatter)))].sort();
    return { ...week, historyComplete: projection.historyComplete, days, progressDays: days.length, status: week.goalDays === null ? "disabled" : !projection.historyComplete ? "incomplete_history" : days.length >= week.goalDays ? "met" : "in_progress" };
  });
}
