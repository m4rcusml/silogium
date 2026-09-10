import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const problems = JSON.parse(readFileSync(resolve(repositoryRoot, "content/problems/generated-catalog.json"), "utf8"));
const classicSeeds = new Map(JSON.parse(readFileSync(resolve(repositoryRoot, "content/problems/classic-registry.json"), "utf8")).map((item) => [item.id, item.slug]));
const privateDirectory = process.env.SILOGIUM_PRIVATE_BUNDLES_DIR ? resolve(process.env.SILOGIUM_PRIVATE_BUNDLES_DIR) : null;

function fingerprint(problem) {
  const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const canonical = normalize(`${problem.title}|${problem.summary}|${[...problem.tags].sort().join(",")}`).replace(/[^a-z0-9|,]+/g, " ").trim();
  let value = 2166136261;
  for (const character of canonical) { value ^= character.charCodeAt(0); value = Math.imul(value, 16777619); }
  return `fnv1a-${(value >>> 0).toString(16).padStart(8, "0")}`;
}

for (const problem of problems) {
  const visible = JSON.parse(readFileSync(resolve(repositoryRoot, `content/judge/${problem.slug}.visible.json`), "utf8"));
  const privatePath = privateDirectory && resolve(privateDirectory, `${problem.slug}.private.json`);
  const privateBundle = privatePath && existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, "utf8")) : null;
  const privateTypeScript = privateDirectory && resolve(privateDirectory, `${problem.slug}.reference.ts`);
  const privatePython = privateDirectory && resolve(privateDirectory, `${problem.slug}.reference.py`);
  const legacyQ1Reference = problem.slug === "rede-de-armarios" ? resolve(repositoryRoot, "reference-solutions/typescript/question1.ts") : null;
  const classicReference = (runtime, extension) => classicSeeds.get(problem.id) === problem.slug ? resolve(repositoryRoot, `reference-solutions/${runtime}/${problem.slug}.${extension}`) : null;
  const publicTypeScript = classicReference("typescript", "ts") ?? legacyQ1Reference;
  const publicPython = classicReference("python", "py");
  const referenceSolutions = {
    ...(privateBundle?.referenceSolutions ?? {}),
    ...((privateTypeScript && existsSync(privateTypeScript)) ? { typescript: readFileSync(privateTypeScript, "utf8") } : publicTypeScript && existsSync(publicTypeScript) ? { typescript: readFileSync(publicTypeScript, "utf8") } : {}),
    ...((privatePython && existsSync(privatePython)) ? { python: readFileSync(privatePython, "utf8") } : publicPython && existsSync(publicPython) ? { python: readFileSync(publicPython, "utf8") } : {})
  };
  const bundle = {
    ...visible,
    hiddenCases: privateBundle?.hiddenCases ?? [],
    referenceSolutions
  };
  const checksum = createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
  const previous = await client.from("problem_versions").select("definition").eq("problem_id", problem.id).eq("version", problem.version).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  const stored = await client.rpc("read_private_judge_bundle", { p_problem_id: problem.id, p_problem_version: problem.version });
  if (stored.error) throw new Error(`Aplique 202609090009_private_artifacts.sql antes do seed: ${stored.error.message}`);
  if (previous.data) {
    if (!isDeepStrictEqual(previous.data.definition, problem) || (stored.data && stored.data.checksum !== checksum)) {
      throw new Error(`${problem.slug}: a versão ${problem.version} já existe com conteúdo diferente. Crie uma nova versão; o seed não sobrescreve histórico.`);
    }
    if (!stored.data) {
      const restored = await client.rpc("insert_private_judge_bundle", { p_problem_id: problem.id, p_problem_version: problem.version, p_bundle: bundle, p_checksum: checksum, p_validation: null });
      if (restored.error) throw new Error(restored.error.message);
    }
    console.log(`${problem.slug}: versão ${problem.version} preservada; nenhuma definição ou bundle existente foi sobrescrito.`);
    continue;
  }
  const existingParent = await client.from("problems").select("id").eq("id", problem.id).maybeSingle();
  if (existingParent.error) throw new Error(existingParent.error.message);
  if (existingParent.data) throw new Error(`${problem.slug}: questão existente sem a versão esperada. Revise o histórico antes de repetir o seed.`);
  const problemRow = await client.from("problems").insert({
    id: problem.id,
    slug: problem.slug,
    owner_id: null,
    origin: problem.origin,
    visibility: problem.visibility,
    status: problem.status,
    current_version: problem.version,
    latest_version: problem.version,
    title: problem.title,
    summary: problem.summary,
    difficulty: problem.difficulty,
    format: problem.format,
    runtimes: problem.runtimes.map((runtime) => runtime.language),
    tags: problem.tags,
    fingerprint: fingerprint(problem),
    updated_at: problem.updatedAt
  });
  if (problemRow.error) throw new Error(problemRow.error.message);
  const version = await client.from("problem_versions").insert({ problem_id: problem.id, version: problem.version, definition: problem, created_by: null });
  if (version.error) throw new Error(version.error.message);
  const judge = await client.rpc("insert_private_judge_bundle", { p_problem_id: problem.id, p_problem_version: problem.version, p_bundle: bundle, p_checksum: checksum, p_validation: null });
  if (judge.error) throw new Error(judge.error.message);
  console.log(`${problem.slug}: ${bundle.visibleCases.length} visíveis, ${bundle.hiddenCases.length} privados.`);
}
