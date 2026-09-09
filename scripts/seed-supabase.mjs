import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const problems = JSON.parse(readFileSync(resolve(repositoryRoot, "content/problems/generated-catalog.json"), "utf8"));
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
  const referenceSolutions = {
    ...(privateBundle?.referenceSolutions ?? {}),
    ...((privateTypeScript && existsSync(privateTypeScript)) ? { typescript: readFileSync(privateTypeScript, "utf8") } : legacyQ1Reference && existsSync(legacyQ1Reference) ? { typescript: readFileSync(legacyQ1Reference, "utf8") } : {}),
    ...((privatePython && existsSync(privatePython)) ? { python: readFileSync(privatePython, "utf8") } : {})
  };
  const bundle = {
    ...visible,
    hiddenCases: privateBundle?.hiddenCases ?? [],
    referenceSolutions
  };
  const problemRow = await client.from("problems").upsert({
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
  const version = await client.from("problem_versions").upsert({ problem_id: problem.id, version: problem.version, definition: problem, created_by: null });
  if (version.error) throw new Error(version.error.message);
  const checksum = createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
  const judge = await client.schema("private").from("judge_bundles").upsert({ problem_id: problem.id, problem_version: problem.version, bundle, checksum });
  if (judge.error) throw new Error(judge.error.message);
  console.log(`${problem.slug}: ${bundle.visibleCases.length} visíveis, ${bundle.hiddenCases.length} privados.`);
}
