import { z } from "zod";
import type { ProblemDefinition } from "./schemas.js";

const id = z.string().uuid();
export const PersonalProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(600),
  website: z.union([z.literal(""), z.string().url().max(300).refine((value) => new URL(value).protocol === "https:", "Use uma URL HTTPS.")]),
  shared: z.boolean()
});
export type PersonalProfile = z.infer<typeof PersonalProfileSchema>;
export const SolutionSnapshotSchema = z.object({
  source: z.string().max(200_000),
  preferences: z.object({ fontSize: z.union([z.literal(12),z.literal(14),z.literal(16),z.literal(18)]), wordWrap: z.boolean(), split: z.number().min(30).max(66), resultHeight: z.number().min(20).max(75), customTests: z.string().max(250_000) })
});
export type SolutionSnapshot = z.infer<typeof SolutionSnapshotSchema>;
export type StudyList = { id: string; title: string; kind: "list" | "track"; problemIds: string[] };
export type PracticeSimulation = { id: string; title: string; problemIds: string[]; versions: Record<string, number>; startedAt: string; endsAt: string; finishedAt?: string };
export type PersonalState = {
  revision: number;
  favorites: string[];
  lists: StudyList[];
  profile: PersonalProfile;
  simulations: PracticeSimulation[];
};
export function emptyPersonalState(handle: string): PersonalState {
  return { revision: 0, favorites: [], lists: [], profile: { displayName: handle, bio: "", website: "", shared: false }, simulations: [] };
}

export const PersonalActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("favorite"), problemId: id, saved: z.boolean() }),
  z.object({ kind: z.literal("save_list"), id: id.optional(), title: z.string().trim().min(1).max(80), listKind: z.enum(["list", "track"]), problemIds: z.array(id).max(100).refine((ids) => new Set(ids).size === ids.length, "Uma questão não pode se repetir na lista.") }),
  z.object({ kind: z.literal("delete_list"), id }),
  z.object({ kind: z.literal("profile"), profile: PersonalProfileSchema }),
  z.object({ kind: z.literal("start_simulation"), title: z.string().trim().min(1).max(80), problemIds: z.array(id).min(1).max(8).refine((ids) => new Set(ids).size === ids.length), minutes: z.number().int().min(5).max(240) }),
  z.object({ kind: z.literal("finish_simulation"), id })
]);
export type PersonalAction = z.infer<typeof PersonalActionSchema>;

/** One state transition behind both adapters. Authorization happens before this call. */
export function updatePersonalState(previous: PersonalState, action: PersonalAction, options: { now: Date; newId: string; accessible: ReadonlyMap<string, ProblemDefinition> }): PersonalState {
  const state = structuredClone(previous);
  const requireProblem = (problemId: string) => {
    const problem = options.accessible.get(problemId);
    if (!problem || !["validated", "pending_review", "published"].includes(problem.status)) throw new Error("Questão indisponível para sua conta.");
    return problem;
  };
  if (action.kind === "favorite") {
    if (action.saved) requireProblem(action.problemId);
    state.favorites = state.favorites.filter((problemId) => problemId !== action.problemId);
    if (action.saved) state.favorites.push(action.problemId);
    if (state.favorites.length > 500) throw new Error("Limite de 500 favoritos.");
  } else if (action.kind === "save_list") {
    action.problemIds.forEach(requireProblem);
    const current = action.id ? state.lists.find((list) => list.id === action.id) : undefined;
    if (action.id && !current) throw new Error("Lista não encontrada.");
    const next = { id: current?.id ?? options.newId, title: action.title, kind: action.listKind, problemIds: action.problemIds };
    if (current) state.lists = state.lists.map((list) => list.id === current.id ? next : list);
    else state.lists.push(next);
    if (state.lists.length > 30) throw new Error("Limite de 30 listas ou trilhas.");
  } else if (action.kind === "delete_list") state.lists = state.lists.filter((list) => list.id !== action.id);
  else if (action.kind === "profile") state.profile = PersonalProfileSchema.parse(action.profile);
  else if (action.kind === "start_simulation") {
    if (state.simulations.some((simulation) => !simulation.finishedAt && Date.parse(simulation.endsAt) > options.now.getTime())) throw new Error("Finalize o simulado atual antes de iniciar outro.");
    if (state.simulations.length >= 100) throw new Error("Limite de 100 simulados por conta nesta versão. Seu histórico foi preservado.");
    const versions = Object.fromEntries(action.problemIds.map((problemId) => [problemId, requireProblem(problemId).version]));
    state.simulations = [...state.simulations, { id: options.newId, title: action.title, problemIds: action.problemIds, versions, startedAt: options.now.toISOString(), endsAt: new Date(options.now.getTime() + action.minutes * 60_000).toISOString() }];
  } else if (action.kind === "finish_simulation") {
    const simulation = state.simulations.find((item) => item.id === action.id);
    if (!simulation) throw new Error("Simulado não encontrado.");
    simulation.finishedAt ??= new Date(Math.min(options.now.getTime(), Date.parse(simulation.endsAt))).toISOString();
  }
  state.revision++;
  return state;
}

/** Transparent next-step suggestions, never a score of proficiency. Only pass accessible problems. */
export function recommendPractice(problems: readonly ProblemDefinition[], activity: readonly { problemId: string; accepted: boolean }[], limit = 3) {
  const attempted = new Set(activity.map((item) => item.problemId));
  const solved = new Set(activity.filter((item) => item.accepted).map((item) => item.problemId));
  const topics = new Set(problems.filter((problem) => attempted.has(problem.id)).flatMap((problem) => problem.metadata?.concepts ?? problem.tags));
  return problems.filter((problem) => !solved.has(problem.id)).map((problem) => {
    const overlap = (problem.metadata?.concepts ?? problem.tags).filter((tag) => topics.has(tag));
    return { problem, score: (attempted.has(problem.id) ? 100 : 0) + overlap.length * 10, reason: attempted.has(problem.id) ? "Retome uma questão que você já começou." : overlap.length ? `Continue praticando ${overlap.slice(0, 2).join(" e ")}.` : "Explore uma questão do catálogo revisado." };
  }).sort((a, b) => b.score - a.score || a.problem.title.localeCompare(b.problem.title, "pt-BR")).slice(0, limit);
}

export const CommunityPostSchema = z.object({
  kind: z.enum(["discussion", "solution", "hint", "editorial"]),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(5).max(20_000),
  runtime: z.enum(["typescript", "python"]).optional()
});
export type CommunityPost = z.infer<typeof CommunityPostSchema> & { id: string; problemId: string; problemVersion: number; authorId: string; authorHandle: string; status: "pending" | "approved" | "rejected" | "removed"; reason?: string; createdAt: string; updatedAt: string };
