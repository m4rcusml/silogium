import { AuthoringWorker, ExercismAdapter, ProblemAuthoringModule, StructuralProblemValidator, createAiAuthoringAdapterFromEnv, memoryAuthoringRepository, resolveAiProviderConfiguration, type AiAuthoringAdapter, type AuthoringRepository } from "@silogium/authoring";
import { createSupabaseAdminClient } from "./supabase/admin";
import { SupabaseAuthoringRepository } from "./supabase/authoring-repository";
import { createJudgeFromEnv } from "@silogium/judge";
import { consumeQuota } from "./usage";
import { getConversationRepository } from "./conversations";
import { SupabaseAuthoringQueue } from "./supabase/authoring-queue";
import { assertProductionServerConfig, isHostedProduction } from "./production-config";

const deferredAi: AiAuthoringAdapter = {
  create: async () => { throw new Error("A autoria deve ser processada pelo worker."); },
  searchWeb: async () => { throw new Error("A pesquisa deve ser processada pelo worker."); },
  importLicensed: async () => { throw new Error("A importação deve ser processada pelo worker."); }
};

const globalModules = globalThis as typeof globalThis & {
  __silogiumAuthoringModule?: ProblemAuthoringModule;
  __silogiumAuthoringRepository?: AuthoringRepository;
  __silogiumAuthoringMode?: string;
};

export function getAuthoringRepository(): AuthoringRepository {
  assertProductionServerConfig();
  if (!createSupabaseAdminClient()) return globalModules.__silogiumAuthoringRepository = memoryAuthoringRepository;
  if (!(globalModules.__silogiumAuthoringRepository instanceof SupabaseAuthoringRepository)) globalModules.__silogiumAuthoringRepository = new SupabaseAuthoringRepository();
  return globalModules.__silogiumAuthoringRepository;
}

export function getAuthoringModule(): ProblemAuthoringModule {
  assertProductionServerConfig();
  const hosted = isHostedProduction();
  const durable = hosted || process.env.SILOGIUM_AUTHORING_MODE === "worker";
  if (durable && !createSupabaseAdminClient()) throw new Error("O processamento durável exige Supabase.");
  const mode = durable ? `durable:${process.env.SILOGIUM_AUTHORING_ENABLED === "true"}` : "local";
  if (globalModules.__silogiumAuthoringMode === mode && globalModules.__silogiumAuthoringModule instanceof ProblemAuthoringModule) return globalModules.__silogiumAuthoringModule;
  const ai = durable ? deferredAi : createAiAuthoringAdapterFromEnv(process.env);
  globalModules.__silogiumAuthoringMode = mode;
  return globalModules.__silogiumAuthoringModule = new ProblemAuthoringModule(
    getAuthoringRepository(),
    ai,
    [new ExercismAdapter()],
    new StructuralProblemValidator(createJudgeFromEnv()),
    !durable,
    async (actor) => {
      const quota = await consumeQuota(actor.id, "ai");
      if (!quota.allowed) throw new Error("Sua cota diária de IA terminou. Tente novamente amanhã.");
    },
    getConversationRepository(),
    undefined,
    durable ? new SupabaseAuthoringQueue() : undefined,
    durable && process.env.SILOGIUM_AUTHORING_ENABLED !== "true" ? "O assistente ainda não está habilitado neste ambiente. Configure e valide o worker antes de ativar a autoria." : undefined
  );
}

/** Standalone worker; provider validation happens before claiming or consuming any quota. */
export function getAuthoringWorker(): AuthoringWorker {
  assertProductionServerConfig();
  if (!createSupabaseAdminClient()) throw new Error("O worker durável exige Supabase; o modo local integrado continua disponível sem worker.");
  if (process.env.SILOGIUM_AUTHORING_ENABLED !== "true") throw new Error("O processamento de autoria não está habilitado.");
  const configuration = resolveAiProviderConfiguration(process.env);
  if (isHostedProduction() && ["local", "codex"].includes(configuration.provider)) throw new Error("Configure um provedor remoto no worker. Codex pessoal e simulador local não são executados em produção.");
  if (isHostedProduction() && (!process.env.MODAL_JUDGE_ENDPOINT || !process.env.MODAL_JUDGE_TOKEN)) throw new Error("Configure o judge remoto antes de processar autoria em produção.");
  const queue = new SupabaseAuthoringQueue();
  const module = new ProblemAuthoringModule(getAuthoringRepository(), createAiAuthoringAdapterFromEnv(process.env), [new ExercismAdapter()],
    new StructuralProblemValidator(createJudgeFromEnv()), false, undefined, getConversationRepository());
  return new AuthoringWorker(queue, (lease, work) => module.processQueuedJob(lease, work), { workerId: process.env.SILOGIUM_WORKER_ID });
}
