import { resolve } from "node:path";
import { LocalJudgeAdapter } from "@silogium/judge";
import { loadSeedPackages } from "./lib/private-seeds.js";

const root = resolve(import.meta.dirname, "..");
const privateDirectory = resolve(process.env.SILOGIUM_PRIVATE_BUNDLES_DIR ?? resolve(root, "..", "silogium-private-bundles"));
const packages = loadSeedPackages(root, privateDirectory);
const judge = new LocalJudgeAdapter();

// Only trusted references are executed locally. Never print private inputs/outputs.
for (const { problem, bundle } of packages) {
  for (const runtime of problem.runtimes) {
    const source = bundle.referenceSolutions[runtime.language];
    if (!source) throw new Error(`Referência ${runtime.language} ausente em ${problem.slug}.`);
    const result = await judge.evaluate(problem, bundle, { kind: "submission", problemId: problem.id, problemVersion: problem.version, runtime: runtime.language, source });
    if (result.verdict !== "accepted") throw new Error(`${problem.slug}/${runtime.language}: ${result.verdict}. Revise o bundle privado localmente.`);
    console.log(`${problem.slug}/${runtime.language}: ${result.score}/${result.maxScore}; ${bundle.hiddenCases.length} casos privados.`);
  }
}
