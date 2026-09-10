export * from "./types.js";
export * from "./durable-jobs.js";
export * from "./conversation.js";
export * from "./module.js";
export * from "./editorial.js";
export * from "./editorial-types.js";
export * from "./repository.js";
export * from "./validator.js";
export * from "./exercism.js";
export * from "./openai.js";
export * from "./local-ai.js";
export * from "./codex.js";
export * from "./providers.js";

import { ExercismAdapter } from "./exercism.js";
import { ProblemAuthoringModule } from "./module.js";
import { createAiAuthoringAdapterFromEnv } from "./providers.js";
import { memoryAuthoringRepository } from "./repository.js";
import { StructuralProblemValidator } from "./validator.js";

export function createProblemAuthoringFromEnv(environment: NodeJS.ProcessEnv = process.env) {
  const ai = createAiAuthoringAdapterFromEnv(environment);
  return new ProblemAuthoringModule(memoryAuthoringRepository, ai, [new ExercismAdapter()], new StructuralProblemValidator());
}
