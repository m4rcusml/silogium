import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const privateDirectory = resolve(process.env.SILOGIUM_PRIVATE_BUNDLES_DIR ?? resolve(root, "..", "silogium-private-bundles"));
const entries = [
  { question: "q1", number: 1, slug: "rede-de-armarios", symbol: "ParcelLockerService" },
  { question: "q2", number: 2, slug: "reservas-de-coworking", symbol: "RoomReservationService" },
  { question: "q3", number: 3, slug: "fazenda-de-builds", symbol: "BuildFarmService" }
];
const directory = mkdtempSync(resolve(tmpdir(), "silogium-private-refs-"));

try {
  for (const entry of entries) {
    const tsReference = resolve(privateDirectory, `${entry.slug}.reference.ts`);
    const effectiveTsReference = existsSync(tsReference) ? tsReference : resolve(root, `reference-solutions/typescript/question${entry.number}.ts`);
    if (!existsSync(effectiveTsReference)) throw new Error(`Referência TypeScript ausente: ${entry.slug}`);
    const patched = [];
    for (const visibility of ["visible", "hidden"]) {
      const sourcePath = resolve(root, `tests/typescript/${entry.question}.${visibility}.ts`);
      const source = readFileSync(sourcePath, "utf8")
        .replace(/from "\.\.\/\.\.\/solutions\/typescript\/question\d+\.js"/, `from ${JSON.stringify(pathToFileURL(effectiveTsReference).href)}`)
        .replace(/from "\.\.\/\.\.\/grader\/typescript\/harness\.js"/, `from ${JSON.stringify(pathToFileURL(resolve(root, "grader/typescript/harness.ts")).href)}`);
      const target = resolve(directory, `${entry.question}-${visibility}.ts`);
      writeFileSync(target, source);
      patched.push(target);
    }
    const runner = resolve(directory, `${entry.question}-runner.mts`);
    writeFileSync(runner, `import { visibleCases } from ${JSON.stringify(pathToFileURL(patched[0]).href)};\nimport { hiddenCases } from ${JSON.stringify(pathToFileURL(patched[1]).href)};\nfor (const test of [...visibleCases, ...hiddenCases]) test.run();\nconsole.log(${JSON.stringify(`${entry.question} TypeScript: OK`)});\n`);
    const tsxCli = resolve(root, "node_modules/tsx/dist/cli.mjs");
    const result = spawnSync(process.execPath, [tsxCli, runner], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    process.stdout.write(result.stdout);

    const pyReference = resolve(privateDirectory, `${entry.slug}.reference.py`);
    if (!existsSync(pyReference)) throw new Error(`Referência Python ausente: ${entry.slug}`);
    const pythonRoot = resolve(directory, `python-${entry.question}`);
    mkdirSync(resolve(pythonRoot, "solutions/python"), { recursive: true });
    mkdirSync(resolve(pythonRoot, "tests/python"), { recursive: true });
    for (const init of ["solutions/__init__.py", "solutions/python/__init__.py", "tests/__init__.py", "tests/python/__init__.py"]) {
      const target = resolve(pythonRoot, init); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, "");
    }
    writeFileSync(resolve(pythonRoot, `solutions/python/question${entry.number}.py`), readFileSync(pyReference));
    for (const visibility of ["visible", "hidden"]) writeFileSync(resolve(pythonRoot, `tests/python/${entry.question}_${visibility}.py`), readFileSync(resolve(root, `tests/python/${entry.question}_${visibility}.py`)));
    const pythonCode = `import sys\nsys.path.insert(0, ${JSON.stringify(pythonRoot)})\nfrom tests.python.${entry.question}_visible import CASES as visible\nfrom tests.python.${entry.question}_hidden import CASES as hidden\nfor _, name, case in [*visible, *hidden]:\n    case()\nprint(${JSON.stringify(`${entry.question} Python: OK`)})`;
    const python = spawnSync(process.platform === "win32" ? "python.exe" : "python3", ["-c", pythonCode], { cwd: pythonRoot, encoding: "utf8" });
    if (python.status !== 0) throw new Error(python.stderr || python.stdout);
    process.stdout.write(python.stdout);
  }
} finally {
  const safe = resolve(directory);
  if (safe.startsWith(resolve(tmpdir()))) rmSync(safe, { recursive: true, force: true });
}
