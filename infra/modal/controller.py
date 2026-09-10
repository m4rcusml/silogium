"""Trusted judge controller. Never copied into a candidate sandbox.

The executor receives CandidateCase only, not this module's payload or fixtures.
Candidate stdout is a value, never a verdict or an authenticated control message.
"""
from __future__ import annotations

import asyncio
import copy
import json
import math
import time
import uuid
from dataclasses import dataclass
from typing import Protocol

PROTOCOL_VERSION = 2
MAX_CASES = 128
MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
OUTPUT_BYTES = 64 * 1024
CASE_TIME_MS = 2_000
TOTAL_SECONDS = 30
PARALLEL_CASES = 4


@dataclass(frozen=True)
class CandidateCase:
    runtime: str
    source: str
    execution_model: str
    entrypoint: dict
    # This is only the current input. No names, IDs, stages, expected or future cases.
    input: dict
    time_ms: int
    output_bytes: int
    memory_mib: int


@dataclass(frozen=True)
class ProcessOutput:
    stdout: bytes
    stderr: bytes = b""
    returncode: int = 0


class CandidateFailure(Exception):
    def __init__(self, verdict: str, message: str):
        super().__init__(message)
        self.verdict = verdict


class CaseExecutor(Protocol):
    async def run(self, case: CandidateCase) -> ProcessOutput: ...


def json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def _integer(value, minimum=0, maximum=2**53 - 1):
    return type(value) is int and minimum <= value <= maximum


def _text(value, maximum, *, empty=False):
    return isinstance(value, str) and (empty or len(value) > 0) and len(value.encode("utf-8")) <= maximum


def _json_value(value, depth=0):
    if depth > 64:
        return False
    if value is None or type(value) in (bool, str):
        return True
    if type(value) in (int, float):
        return math.isfinite(value)
    if type(value) is list:
        return all(_json_value(item, depth + 1) for item in value)
    if type(value) is dict:
        return all(type(key) is str and _json_value(item, depth + 1) for key, item in value.items())
    return False


def _reject_constant(value):
    raise ValueError("Número JSON inválido")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Chave JSON duplicada")
        result[key] = value
    return result


def parse_json(raw: bytes):
    value = json.loads(raw.decode("utf-8"), parse_constant=_reject_constant, object_pairs_hook=_unique_object)
    if not _json_value(value):
        raise ValueError("JSON fora dos limites")
    return value


def _prepare(payload):
    # The HTTP adapter is authenticated, but validate the controller seam as well.
    if not isinstance(payload, dict) or payload.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("Protocolo do judge incompatível; publique o controlador v2.")
    if len(json_bytes(payload)) > MAX_PAYLOAD_BYTES:
        raise ValueError("Pacote excede o limite do judge.")
    problem, bundle, request = payload["problem"], payload["bundle"], payload["request"]
    if request.get("kind") not in ("run", "submission") or request.get("runtime") not in ("typescript", "python"):
        raise ValueError("Execução inválida.")
    if (problem["id"] != bundle["problemId"] or problem["id"] != request["problemId"]
            or problem["version"] != bundle["problemVersion"] or problem["version"] != request["problemVersion"]):
        raise ValueError("Identidade ou versão divergente.")
    if not _text(request.get("source"), 800_000) or len(request["source"]) > 200_000:
        raise ValueError("Código inválido.")
    stages = problem["stages"]
    if (not isinstance(stages, list) or not 1 <= len(stages) <= 4
            or any(not _integer(stage.get("number"), 1, 4) or not _integer(stage.get("points"), 0, 1_000_000) for stage in stages)
            or len({stage["number"] for stage in stages}) != len(stages)):
        raise ValueError("Estágios inválidos.")
    stage_numbers = {stage["number"] for stage in stages}
    max_stage = request.get("maxStage", max(stage_numbers))
    if max_stage not in stage_numbers or not _integer(max_stage, 1, 4):
        raise ValueError("Estágio inválido.")
    runtime = next(item for item in problem["runtimes"] if item["language"] == request["runtime"])
    entrypoint = runtime["entrypoint"]
    model = problem["executionModel"]
    if model not in ("stdio", "call-sequence") or entrypoint.get("kind") != ("script" if model == "stdio" else "class"):
        raise ValueError("Entrypoint incompatível.")
    if model == "call-sequence":
        if not _text(entrypoint.get("symbol"), 256) or not isinstance(entrypoint.get("methodMap", {}), dict):
            raise ValueError("Entrypoint inválido.")
        if any(not _text(key, 256) or not _text(value, 256) for key, value in entrypoint.get("methodMap", {}).items()):
            raise ValueError("Mapa de métodos inválido.")
    limits = problem["limits"]
    if any(not _integer(limits.get(key), 1, maximum) for key, maximum in (("timeMs", 30_000), ("outputBytes", 1_048_576), ("memoryMiB", 4096))):
        raise ValueError("Limites inválidos.")
    # Bounds are server policy, never controlled by code or generated content.
    safe_limits = dict(time_ms=min(limits["timeMs"], CASE_TIME_MS),
                       output_bytes=min(limits["outputBytes"], OUTPUT_BYTES),
                       memory_mib=min(limits["memoryMiB"], 256))
    visible, hidden = bundle["visibleCases"], bundle["hiddenCases"]
    if not isinstance(visible, list) or not isinstance(hidden, list):
        raise ValueError("Casos inválidos.")
    all_cases = visible + hidden
    if len(all_cases) > MAX_CASES or len({case["id"] for case in all_cases}) != len(all_cases):
        raise ValueError("Casos em excesso ou IDs duplicados.")
    for case in all_cases:
        if (case.get("kind") != model or not _text(case.get("id"), 256)
                or not _text(case.get("name"), 512) or case.get("stage") not in stage_numbers):
            raise ValueError("Caso incompatível.")
        if model == "stdio":
            if not _text(case.get("stdin"), 2_000_000, empty=True) or not _text(case.get("expectedStdout"), 2_000_000, empty=True):
                raise ValueError("Caso stdio inválido.")
        else:
            calls = case.get("calls")
            if (not isinstance(case.get("constructorArgs"), list) or not isinstance(calls, list) or not 1 <= len(calls) <= 10_000
                    or any(not _text(call.get("method"), 256) or not isinstance(call.get("args"), list)
                           or "expected" not in call for call in calls)):
                raise ValueError("Sequência de chamadas inválida.")
    cases = [case for case in (visible if request["kind"] == "run" else all_cases) if case["stage"] <= max_stage]
    if not cases:
        raise ValueError("Nenhum caso selecionado.")
    return problem, request, entrypoint, cases, {case["id"] for case in hidden}, safe_limits


def candidate_case(request, entrypoint, case, limits):
    """Allowlist projection: not even references to trusted fixture objects escape."""
    case_input = ({"stdin": case["stdin"]} if case["kind"] == "stdio" else {
        "constructorArgs": copy.deepcopy(case["constructorArgs"]),
        "calls": [{"method": call["method"], "args": copy.deepcopy(call["args"])} for call in case["calls"]],
    })
    public_entrypoint = ({"kind": "script"} if case["kind"] == "stdio" else {
        "kind": "class", "symbol": entrypoint["symbol"], "methodMap": copy.deepcopy(entrypoint.get("methodMap", {})),
    })
    return CandidateCase(request["runtime"], request["source"], case["kind"], public_entrypoint, case_input, **limits)


def _equal(actual, expected):
    # JSON equality: object key order is irrelevant; bool must not equal 0/1.
    if type(actual) in (int, float) and type(expected) in (int, float):
        return actual == expected
    if type(actual) is not type(expected):
        return False
    if isinstance(actual, list):
        return len(actual) == len(expected) and all(_equal(a, b) for a, b in zip(actual, expected))
    if isinstance(actual, dict):
        return actual.keys() == expected.keys() and all(_equal(actual[key], expected[key]) for key in actual)
    return actual == expected


def _compare(case, output):
    try:
        actual_text = output.stdout.decode("utf-8")
        if case["kind"] == "stdio":
            passed = actual_text.replace("\r\n", "\n").rstrip() == case["expectedStdout"].replace("\r\n", "\n").rstrip()
            return None if passed else {"expected": case["expectedStdout"], "actual": actual_text, "input": case["stdin"]}
        values = parse_json(output.stdout)
        # No candidate-written passed/id/stage/score fields are accepted.
        if not isinstance(values, list) or len(values) != len(case["calls"]):
            raise ValueError("Formato do protocolo de valores inválido")
        for value, call in zip(values, case["calls"]):
            if not isinstance(value, dict) or set(value) != {"value"}:
                raise ValueError("Valor de retorno inválido")
            if not _equal(value["value"], call["expected"]):
                return {"expected": call["expected"], "actual": value["value"], "method": call["method"], "input": call["args"]}
        return None
    except (UnicodeError, ValueError, TypeError, RecursionError):
        raise CandidateFailure("runtime_error", "A solução não produziu uma resposta válida.") from None


def _bounded_mismatch(mismatch):
    if "input" in mismatch and len(json_bytes(mismatch["input"])) > 2048:
        mismatch = {key: value for key, value in mismatch.items() if key != "input"}
    return mismatch if len(json_bytes(mismatch)) <= 4096 else None


async def evaluate_payload(payload, executor: CaseExecutor, *, total_seconds=TOTAL_SECONDS, concurrency=PARALLEL_CASES):
    started = time.monotonic()
    result_id = str(uuid.uuid4())

    def failure(verdict, message):
        return {"id": result_id, "verdict": verdict, "score": 0, "maxScore": 0, "cases": [],
                "durationMs": round((time.monotonic() - started) * 1000), "message": message}

    try:
        problem, request, entrypoint, cases, hidden_ids, limits = _prepare(payload)
    except (KeyError, TypeError, ValueError, StopIteration, OverflowError, RecursionError):
        return failure("system_error", "Pacote inválido ou incompatível com o judge v2.")

    semaphore = asyncio.Semaphore(min(max(1, concurrency), PARALLEL_CASES))

    async def run_case(case):
        async with semaphore:
            output = await executor.run(candidate_case(request, entrypoint, case, limits))
            if not isinstance(output, ProcessOutput) or not isinstance(output.stdout, bytes) or not isinstance(output.stderr, bytes):
                raise RuntimeError("Adapter de execução inválido")
            if len(output.stdout) + len(output.stderr) > limits["output_bytes"]:
                raise CandidateFailure("output_limit", "Limite de saída excedido.")
            if output.returncode != 0:
                raise CandidateFailure("runtime_error", "A solução terminou com erro.")
            mismatch = _compare(case, output)
            hidden = request["kind"] == "submission" and case["id"] in hidden_ids
            outcome = {"id": case["id"], "name": "Teste oculto" if hidden else case["name"],
                       "stage": case["stage"], "passed": mismatch is None}
            if mismatch is not None and not hidden:
                outcome["message"] = "Resposta incorreta."
                bounded = _bounded_mismatch(mismatch)
                if bounded is not None:
                    outcome["mismatch"] = bounded
            return outcome

    tasks = [asyncio.create_task(run_case(case)) for case in cases]
    try:
        outcomes = await asyncio.wait_for(asyncio.gather(*tasks), timeout=min(total_seconds, TOTAL_SECONDS))
    except CandidateFailure as error:
        return failure(error.verdict, str(error))
    except TimeoutError:
        # Includes provisioning/compilation/transport. Not attributable to candidate time.
        return failure("system_error", "O judge excedeu o prazo total de processamento. Tente novamente.")
    except Exception:
        return failure("system_error", "Falha na infraestrutura do judge.")
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    score = max_score = 0
    for stage in problem["stages"]:
        selected = [case for case in outcomes if case["stage"] == stage["number"]]
        if selected:
            max_score += stage["points"]
            # Match JavaScript Math.round for nonnegative stage scores.
            score += math.floor(stage["points"] * sum(case["passed"] for case in selected) / len(selected) + 0.5)
    result = {"id": result_id, "verdict": "accepted" if all(case["passed"] for case in outcomes) else "wrong_answer",
              "score": score, "maxScore": max_score, "cases": outcomes,
              "durationMs": round((time.monotonic() - started) * 1000)}
    # Diagnostics are optional; case inventory and controller verdict are not.
    for outcome in reversed(outcomes):
        if len(json_bytes(result)) <= OUTPUT_BYTES:
            break
        outcome.pop("mismatch", None)
    if len(json_bytes(result)) > OUTPUT_BYTES:
        return failure("system_error", "Metadados de resultado excedem o limite do judge.")
    return result
