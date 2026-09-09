import { problemOwnerId, type Actor, type ProblemDefinition } from "./schemas.js";

const transitions: Record<ProblemDefinition["status"], ProblemDefinition["status"][]> = {
  draft: ["validating"],
  validating: ["validated", "rejected"],
  validated: ["pending_review", "draft"],
  pending_review: ["published", "rejected", "draft"],
  published: ["draft"],
  rejected: ["draft", "validating"]
};

export function canTransitionProblem(from: ProblemDefinition["status"], to: ProblemDefinition["status"]): boolean {
  return transitions[from].includes(to);
}

export function transitionProblem(
  problem: ProblemDefinition,
  to: ProblemDefinition["status"],
  actor: Actor,
  now = new Date()
): ProblemDefinition {
  if (!canTransitionProblem(problem.status, to)) throw new Error(`Transição inválida: ${problem.status} → ${to}`);
  if (to === "published" && actor.role !== "admin") throw new Error("Somente administradores podem publicar questões.");
  return { ...problem, status: to, visibility: to === "published" ? "public" : problem.visibility, updatedAt: now.toISOString() };
}

export function canReadProblem(problem: ProblemDefinition, actor?: Actor, hasUnlistedLink = false): boolean {
  if (problem.status === "published" && problem.visibility === "public") return true;
  if (actor?.role === "admin") return true;
  const ownerId = problemOwnerId(problem);
  if (actor && ownerId === actor.id) return true;
  return problem.visibility === "unlisted" && hasUnlistedLink;
}
