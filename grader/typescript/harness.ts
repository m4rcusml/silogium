import assert from "node:assert/strict";

export interface TestCase {
  level: 1 | 2 | 3 | 4;
  name: string;
  run: () => void;
}

export function equal<T>(actual: T, expected: T, message?: string): void {
  assert.deepStrictEqual(actual, expected, message);
}

export function ok(value: unknown, message?: string): void {
  assert.ok(value, message);
}

export function runCases(cases: TestCase[], title: string): number {
  console.log(`\n${title}\n${"=".repeat(title.length)}`);
  let totalScore = 0;
  let failures = 0;

  for (const level of [1, 2, 3, 4] as const) {
    const levelCases = cases.filter((test) => test.level === level);
    if (levelCases.length === 0) continue;

    let passed = 0;
    console.log(`\nNível ${level}`);
    for (const test of levelCases) {
      try {
        test.run();
        passed += 1;
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ✗ ${test.name}`);
        console.log(`    ${message.replaceAll("\n", "\n    ")}`);
      }
    }

    const levelScore = Math.round((passed / levelCases.length) * 150);
    totalScore += levelScore;
    console.log(`  Resultado: ${passed}/${levelCases.length} — ${levelScore}/150 pontos`);
  }

  console.log(`\nPontuação simulada: ${totalScore}/600`);
  if (failures > 0) console.log(`Falhas: ${failures}`);
  return failures;
}
