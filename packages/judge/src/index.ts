export * from "./types.js";
export * from "./scoring.js";
export * from "./local.js";
export * from "./modal.js";

import type { Judge } from "./types.js";
import { LocalJudgeAdapter } from "./local.js";
import { ModalJudgeAdapter, UnavailableJudgeAdapter } from "./modal.js";

export function createJudgeFromEnv(environment: NodeJS.ProcessEnv = process.env): Judge {
  if (environment.MODAL_JUDGE_ENDPOINT) {
    return new ModalJudgeAdapter(environment.MODAL_JUDGE_ENDPOINT, environment.MODAL_JUDGE_TOKEN);
  }
  if (environment.NODE_ENV !== "production" && environment.SILOGIUM_ALLOW_LOCAL_EXECUTION !== "false") {
    return new LocalJudgeAdapter();
  }
  return new UnavailableJudgeAdapter();
}
