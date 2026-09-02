import { runCases, type TestCase } from "./harness.js";
import { visibleCases as q1Visible } from "../../tests/typescript/q1.visible.js";
import { hiddenCases as q1Hidden } from "../../tests/typescript/q1.hidden.js";
import { visibleCases as q2Visible } from "../../tests/typescript/q2.visible.js";
import { hiddenCases as q2Hidden } from "../../tests/typescript/q2.hidden.js";

const [question, mode = "visible", rawMaxLevel = "4"] = process.argv.slice(2);
const maxLevel = Number(rawMaxLevel);

if (!new Set(["q1", "q2"]).has(question ?? "")) {
  console.error("Questão inválida. Use q1 ou q2.");
  process.exit(2);
}
if (!new Set(["visible", "grade"]).has(mode)) {
  console.error("Modo inválido. Use visible ou grade.");
  process.exit(2);
}
if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 4) {
  console.error("Nível inválido. Use um inteiro de 1 a 4.");
  process.exit(2);
}

const selectedQuestion = question as "q1" | "q2";
let cases: TestCase[];
if (selectedQuestion === "q1") {
  cases = mode === "grade" ? [...q1Visible, ...q1Hidden] : q1Visible;
} else {
  cases = mode === "grade" ? [...q2Visible, ...q2Hidden] : q2Visible;
}

cases = cases.filter((test) => test.level <= maxLevel);
const label = `${selectedQuestion.toUpperCase()} — TypeScript — ${mode === "grade" ? "submissão" : "testes visíveis"}`;
const failures = runCases(cases, label);
process.exitCode = failures === 0 ? 0 : 1;
