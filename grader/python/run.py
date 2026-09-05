from __future__ import annotations

import importlib
import sys
import traceback
from pathlib import Path
from typing import Callable, TypeAlias

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

TestCase: TypeAlias = tuple[int, str, Callable[[], None]]


def run_cases(cases: list[TestCase], title: str) -> int:
    print(f"\n{title}\n{'=' * len(title)}")
    total_score = 0
    failures = 0

    for level in range(1, 5):
        level_cases = [case for case in cases if case[0] == level]
        if not level_cases:
            continue

        passed = 0
        print(f"\nNível {level}")
        for _, name, test in level_cases:
            try:
                test()
                passed += 1
                print(f"  ✓ {name}")
            except Exception as error:  # noqa: BLE001 - harness deliberadamente amplo
                failures += 1
                print(f"  ✗ {name}")
                message = str(error) or traceback.format_exc(limit=1).strip()
                print("    " + message.replace("\n", "\n    "))

        level_score = round((passed / len(level_cases)) * 150)
        total_score += level_score
        print(
            f"  Resultado: {passed}/{len(level_cases)} — "
            f"{level_score}/150 pontos"
        )

    print(f"\nPontuação simulada: {total_score}/600")
    if failures:
        print(f"Falhas: {failures}")
    return failures


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python grader/python/run.py q1|q2|q3 visible|grade [1-4]")
        return 2

    question = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "visible"
    max_level = int(sys.argv[3]) if len(sys.argv) > 3 else 4

    if question not in {"q1", "q2", "q3"} or mode not in {"visible", "grade"}:
        print("Questão ou modo inválido.")
        return 2
    if max_level not in {1, 2, 3, 4}:
        print("Nível inválido. Use 1 a 4.")
        return 2

    visible_module = importlib.import_module(f"tests.python.{question}_visible")
    cases: list[TestCase] = list(visible_module.CASES)
    if mode == "grade":
        hidden_module = importlib.import_module(f"tests.python.{question}_hidden")
        cases.extend(hidden_module.CASES)

    cases = [case for case in cases if case[0] <= max_level]
    label = (
        f"{question.upper()} — Python — "
        f"{'submissão' if mode == 'grade' else 'testes visíveis'}"
    )
    return 1 if run_cases(cases, label) else 0


if __name__ == "__main__":
    raise SystemExit(main())
