import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JudgeBundleSchema, type JudgeBundle } from "@silogium/core";

function repositoryRoot(): string {
  const current = process.cwd();
  const localContent = resolve(current, "content", "judge");
  return existsSync(localContent) ? current : resolve(current, "..", "..");
}

export function loadVisibleBundle(slug: string): JudgeBundle {
  const path = resolve(repositoryRoot(), "content", "judge", `${slug}.visible.json`);
  return JudgeBundleSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
