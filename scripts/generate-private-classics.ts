import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertExternalPrivateDirectory, privateClassicCases } from "./lib/private-seeds.js";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(process.env.SILOGIUM_PRIVATE_BUNDLES_DIR ?? resolve(root, "..", "silogium-private-bundles"));
// Add only missing files; never rotate tests for an existing published version.
mkdirSync(directory, { recursive: true });
const external = assertExternalPrivateDirectory(root, directory);
const registry = JSON.parse(readFileSync(resolve(root, "content/problems/classic-registry.json"), "utf8")) as { slug: string }[];
for (const { slug } of registry) {
  const path = resolve(external, `${slug}.private.json`);
  if (existsSync(path)) { console.log(`${slug}: preservado.`); continue; }
  writeFileSync(path, JSON.stringify({ hiddenCases: privateClassicCases(slug) }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(`${slug}: casos privados gerados fora do repositório.`);
}
