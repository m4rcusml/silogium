import { ExercismAdapter, LocalAiAdapter, OpenAiAuthoringAdapter, ProblemAuthoringModule, StructuralProblemValidator, memoryAuthoringRepository, type AuthoringRepository } from "@silogium/authoring";
import { createSupabaseAdminClient } from "./supabase/admin";
import { SupabaseAuthoringRepository } from "./supabase/authoring-repository";
import { createJudgeFromEnv } from "@silogium/judge";

const globalModules = globalThis as typeof globalThis & {
  __silogiumAuthoringModule?: ProblemAuthoringModule;
  __silogiumAuthoringRepository?: AuthoringRepository;
};

export function getAuthoringRepository(): AuthoringRepository {
  if (globalModules.__silogiumAuthoringRepository) return globalModules.__silogiumAuthoringRepository;
  return globalModules.__silogiumAuthoringRepository = createSupabaseAdminClient()
    ? new SupabaseAuthoringRepository()
    : memoryAuthoringRepository;
}

export function getAuthoringModule(): ProblemAuthoringModule {
  if (globalModules.__silogiumAuthoringModule) return globalModules.__silogiumAuthoringModule;
  const ai = process.env.OPENAI_API_KEY
    ? new OpenAiAuthoringAdapter(process.env.OPENAI_API_KEY, process.env.OPENAI_DISCOVERY_MODEL ?? "gpt-5.6-luna", process.env.OPENAI_AUTHORING_MODEL ?? "gpt-5.6-terra")
    : new LocalAiAdapter();
  return globalModules.__silogiumAuthoringModule = new ProblemAuthoringModule(
    getAuthoringRepository(),
    ai,
    [new ExercismAdapter()],
    new StructuralProblemValidator(createJudgeFromEnv())
  );
}
