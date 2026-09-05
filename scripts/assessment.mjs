import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, rawQuestion, rawLanguage, rawLevel] = process.argv.slice(2);
const question = rawQuestion?.toLowerCase();
const language = rawLanguage?.toLowerCase();
const level = rawLevel ?? "4";

const validQuestions = new Set(["q1", "q2", "q3"]);
const validLanguages = new Set(["ts", "py"]);

function usage(exitCode = 0) {
  console.log(`
Uso:
  npm run assessment -- start  q1 ts
  npm run assessment -- status q1 ts
  npm run assessment -- test   q1 ts 1
  npm run assessment -- submit q1 ts
  npm run assessment -- open   q1 ts

Questões: q1, q2, q3 | Linguagens: ts, py | Níveis: 1 a 4
`);
  process.exit(exitCode);
}

if (!command) usage(0);
if (!validQuestions.has(question) || !validLanguages.has(language)) usage(1);

const sessionsDir = join(root, ".sessions");
const sessionPath = join(sessionsDir, `${question}-${language}.json`);

function questionDir() {
  const folders = {
    q1: "q1_parcel_network",
    q2: "q2_room_reservations",
    q3: "q3_build_farm"
  };
  return join(root, "questions", folders[question]);
}

function solutionPath() {
  const folder = language === "ts" ? "typescript" : "python";
  const extension = language === "ts" ? "ts" : "py";
  const number = question.slice(1);
  return join(root, "solutions", folder, `question${number}.${extension}`);
}

function readSession() {
  if (!existsSync(sessionPath)) return null;
  return JSON.parse(readFileSync(sessionPath, "utf8"));
}

function formatRemaining(deadlineAt) {
  const milliseconds = new Date(deadlineAt).getTime() - Date.now();
  if (milliseconds <= 0) return "TEMPO ESGOTADO";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s restantes`;
}

function runTests(mode) {
  const numericLevel = Number(level);
  if (!Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 4) {
    console.error("O nível deve estar entre 1 e 4.");
    process.exit(1);
  }

  const args = language === "ts"
    ? ["tsx", "grader/typescript/run.ts", question, mode, String(numericLevel)]
    : ["grader/python/run.py", question, mode, String(numericLevel)];
  const executable = language === "ts" ? "npx" : "python";
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  process.exit(result.status ?? 1);
}

switch (command.toLowerCase()) {
  case "start": {
    mkdirSync(sessionsDir, { recursive: true });
    const existing = readSession();
    if (existing) {
      console.log(`Já existe uma sessão para ${question}/${language}.`);
      console.log(formatRemaining(existing.deadlineAt));
      console.log("Use outra combinação de questão/linguagem ou continue a sessão atual.");
      break;
    }
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + 90 * 60 * 1000);
    writeFileSync(sessionPath, JSON.stringify({ question, language, startedAt, deadlineAt }, null, 2));
    console.log(`Sessão iniciada: ${question.toUpperCase()} / ${language.toUpperCase()}`);
    console.log(`Início: ${startedAt.toLocaleString("pt-BR")}`);
    console.log(`Fim sugerido: ${deadlineAt.toLocaleString("pt-BR")}`);
    console.log(`Enunciado inicial: ${join(questionDir(), "LEVEL_1.md")}`);
    console.log(`Solução: ${solutionPath()}`);
    console.log(`Teste: npm run assessment -- test ${question} ${language} 1`);
    break;
  }
  case "status": {
    const session = readSession();
    if (!session) {
      console.log("Nenhuma sessão iniciada para essa combinação.");
      process.exit(1);
    }
    console.log(`${question.toUpperCase()} / ${language.toUpperCase()}: ${formatRemaining(session.deadlineAt)}`);
    console.log(`Deadline local: ${new Date(session.deadlineAt).toLocaleString("pt-BR")}`);
    break;
  }
  case "test":
    runTests("visible");
    break;
  case "submit":
    runTests("grade");
    break;
  case "open": {
    const child = spawn("code", [root, solutionPath(), join(questionDir(), "LEVEL_1.md")], {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32"
    });
    child.unref();
    console.log("Projeto aberto no VS Code.");
    break;
  }
  default:
    usage(1);
}
