import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import ts from "typescript";
import { loadBindings, minify } from "next/dist/build/swc/index.js";

it("Groq artifact formatting remains valid JavaScript after the production minifier", async () => {
  const source = await readFile(new URL("../src/groq.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  await loadBindings();
  const compiled = await minify(javascript, { compress: true, mangle: true, format: { ascii_only: true } });
  expect(() => new Script(compiled.code)).not.toThrow();
});
