import { ExercismAdapter, ProblemAuthoringModule, StructuralProblemValidator, createAiAuthoringAdapterFromEnv, memoryAuthoringRepository, type AuthoringRepository } from "@silogium/authoring";
import { createSupabaseAdminClient } from "./supabase/admin";
import { SupabaseAuthoringRepository } from "./supabase/authoring-repository";
import { createJudgeFromEnv } from "@silogium/judge";
import { consumeQuota } from "./usage";
import { getConversationRepository } from "./conversations";

const globalModules = globalThis as typeof globalThis & {
  __silogiumAuthoringModule?: ProblemAuthoringModule;
  __silogiumAuthoringRepository?: AuthoringRepository;
};

export function getAuthoringRepository(): AuthoringRepository {
  if (!createSupabaseAdminClient()) return globalModules.__silogiumAuthoringRepository = memoryAuthoringRepository;
  if (!(globalModules.__silogiumAuthoringRepository instanceof SupabaseAuthoringRepository)) globalModules.__silogiumAuthoringRepository = new SupabaseAuthoringRepository();
  return globalModules.__silogiumAuthoringRepository;
}

export function getAuthoringModule(): ProblemAuthoringModule {
  if (globalModules.__silogiumAuthoringModule instanceof ProblemAuthoringModule) return globalModules.__silogiumAuthoringModule;
  const ai = createAiAuthoringAdapterFromEnv(process.env);
  return globalModules.__silogiumAuthoringModule = new ProblemAuthoringModule(
    getAuthoringRepository(),
    ai,
    [new ExercismAdapter()],
    new StructuralProblemValidator(createJudgeFromEnv()),
    true,
    async (actor) => {
      const quota = await consumeQuota(actor.id, "ai");
      if (!quota.allowed) throw new Error("Sua cota diária de IA terminou. Tente novamente amanhã.");
    },
    getConversationRepository()
  );
}
