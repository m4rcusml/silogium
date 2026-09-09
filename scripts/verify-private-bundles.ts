import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProblemDefinitionSchema, JudgeBundleSchema } from "@silogium/core";
import { LocalJudgeAdapter } from "@silogium/judge";

const root = resolve(import.meta.dirname, "..");
const privateDirectory = resolve(process.env.SILOGIUM_PRIVATE_BUNDLES_DIR ?? resolve(root, "..", "silogium-private-bundles"));
const problems = ProblemDefinitionSchema.array().parse(JSON.parse(readFileSync(resolve(root, "content/problems/generated-catalog.json"), "utf8")));
const judge = new LocalJudgeAdapter();

for (const problem of problems) {
  const visible = JSON.parse(readFileSync(resolve(root, `content/judge/${problem.slug}.visible.json`), "utf8"));
  const privateBundle = JSON.parse(readFileSync(resolve(privateDirectory, `${problem.slug}.private.json`), "utf8"));
  const references: Record<string, string> = {};
  for (const [runtime, extension] of [["typescript", "ts"], ["python", "py"]] as const) {
    const privatePath = resolve(privateDirectory, `${problem.slug}.reference.${extension}`);
    const fallback = runtime === "typescript" && problem.slug === "rede-de-armarios" ? resolve(root, "reference-solutions/typescript/question1.ts") : privatePath;
    if (existsSync(privatePath)) references[runtime] = readFileSync(privatePath, "utf8");
    else if (existsSync(fallback)) references[runtime] = readFileSync(fallback, "utf8");
  }
  const bundle = JudgeBundleSchema.parse({ ...visible, hiddenCases: privateBundle.hiddenCases, referenceSolutions: references });
  for (const runtime of problem.runtimes) {
    const source = bundle.referenceSolutions[runtime.language];
    if (!source) throw new Error(`Referência ${runtime.language} ausente em ${problem.slug}.`);
    const result = await judge.evaluate(problem, bundle, { kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime: runtime.language, source });
    if (result.verdict !== "accepted") throw new Error(`${problem.slug}/${runtime.language}: ${result.verdict} ${result.message ?? ""}`);
    console.log(`${problem.slug}/${runtime.language}: ${result.score}/${result.maxScore}`);
  }
}
