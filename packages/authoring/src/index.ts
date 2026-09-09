export * from "./types.js";
export * from "./module.js";
export * from "./repository.js";
export * from "./validator.js";
export * from "./exercism.js";
export * from "./openai.js";
export * from "./local-ai.js";

import { ExercismAdapter } from "./exercism.js";
import { LocalAiAdapter } from "./local-ai.js";
import { ProblemAuthoringModule } from "./module.js";
import { OpenAiAuthoringAdapter } from "./openai.js";
import { memoryAuthoringRepository } from "./repository.js";
import { StructuralProblemValidator } from "./validator.js";

export function createProblemAuthoringFromEnv(environment: NodeJS.ProcessEnv = process.env) {
  const ai = environment.OPENAI_API_KEY
    ? new OpenAiAuthoringAdapter(environment.OPENAI_API_KEY, environment.OPENAI_DISCOVERY_MODEL, environment.OPENAI_AUTHORING_MODEL)
    : new LocalAiAdapter();
  return new ProblemAuthoringModule(memoryAuthoringRepository, ai, [new ExercismAdapter()], new StructuralProblemValidator());
}
