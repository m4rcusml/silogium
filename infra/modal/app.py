"""Judge remoto do Silogium.

Deploy:
  modal secret create silogium-judge-token AUTH_TOKEN=<segredo-forte>
  modal deploy infra/modal/app.py
"""

from __future__ import annotations

import hmac
import json
import os
import textwrap
import time
import uuid

import fastapi
import modal

app = modal.App("silogium-judge")

controller_image = modal.Image.debian_slim(python_version="3.13").uv_pip_install(
    "fastapi[standard]==0.139.2"
)
typescript_image = (
    modal.Image.from_registry("node:22.22.0-bookworm-slim")
    .apt_install("python3")
    .run_commands("npm install --global esbuild@0.25.12")
)
python_image = modal.Image.from_registry("python:3.13.11-slim")

RUNNER = r'''
import json, pathlib, subprocess, sys, time

payload = json.loads(pathlib.Path("/work/payload.json").read_text())
problem, bundle, request = payload["problem"], payload["bundle"], payload["request"]
runtime = next(item for item in problem["runtimes"] if item["language"] == request["runtime"])
cases = bundle["visibleCases"] if request["kind"] == "run" else bundle["visibleCases"] + bundle["hiddenCases"]
if request.get("maxStage"):
    cases = [case for case in cases if case["stage"] <= request["maxStage"]]

limit_ms = int(problem["limits"]["timeMs"])
output_limit = int(problem["limits"]["outputBytes"])
started = time.monotonic()

def failure(verdict, message):
    return {"verdict": verdict, "score": 0, "maxScore": 0, "cases": [], "message": message}

def execute(command, stdin="", timeout_ms=limit_ms):
    try:
        completed = subprocess.run(command, input=stdin, text=True, capture_output=True, timeout=timeout_ms / 1000)
    except subprocess.TimeoutExpired:
        return None, "time_limit", "Tempo limite excedido."
    output_size = len(completed.stdout.encode()) + len(completed.stderr.encode())
    if output_size > output_limit:
        return None, "output_limit", "Limite de saída excedido."
    if completed.returncode != 0:
        stderr = completed.stderr[-2000:] or "A execução falhou."
        if completed.returncode in (-9, 137):
            return None, "memory_limit", "Limite de memória excedido."
        compile_markers = ("SyntaxError", "TSError", "TS", "Cannot find module", "não encontrado")
        verdict = "compile_error" if any(marker in stderr for marker in compile_markers) else "runtime_error"
        return None, verdict, stderr
    return completed.stdout, None, None

outcomes = []
if request["runtime"] == "typescript":
    try:
        compilation = subprocess.run(
            ["esbuild", "/work/solution.ts", "--format=esm", "--platform=node", "--target=node22", "--outfile=/work/solution.mjs"],
            text=True, capture_output=True, timeout=10
        )
    except subprocess.TimeoutExpired:
        print(json.dumps(failure("system_error", "O compilador excedeu o tempo de inicialização.")))
        raise SystemExit
    if compilation.returncode != 0:
        print(json.dumps(failure("compile_error", compilation.stderr[-2000:] or "Falha ao compilar TypeScript.")))
        raise SystemExit

if problem["executionModel"] == "stdio":
    command = ["node", "/work/solution.mjs"] if request["runtime"] == "typescript" else ["python", "/work/solution.py"]
    for case in cases:
        output, verdict, message = execute(command, case["stdin"])
        if verdict:
            print(json.dumps(failure(verdict, message)))
            raise SystemExit
        passed = output.rstrip().replace("\r\n", "\n") == case["expectedStdout"].rstrip().replace("\r\n", "\n")
        outcomes.append({"id": case["id"], "name": case["name"], "stage": case["stage"], "passed": passed, **({} if passed else {"message": "Saída incorreta.", "mismatch": {"expected": case["expectedStdout"], "actual": output, "input": case["stdin"]}})})
else:
    wrapper = "/work/call_runner.mjs" if request["runtime"] == "typescript" else "/work/call_runner.py"
    command = ["node", wrapper] if request["runtime"] == "typescript" else ["python", wrapper]
    output, verdict, message = execute(command, timeout_ms=min(30000, max(limit_ms, limit_ms * len(cases))))
    if verdict:
        print(json.dumps(failure(verdict, message)))
        raise SystemExit
    try:
        outcomes = json.loads(output)
    except Exception:
        print(json.dumps(failure("runtime_error", "O runner devolveu uma saída inválida.")))
        raise SystemExit

hidden_ids = {case["id"] for case in bundle["hiddenCases"]}
if request["kind"] == "submission":
    for outcome in outcomes:
        if outcome["id"] in hidden_ids:
            outcome["name"] = "Teste oculto"
            outcome.pop("message", None)
            outcome.pop("mismatch", None)

score = 0
max_score = 0
for stage in problem["stages"]:
    stage_cases = [case for case in outcomes if case["stage"] == stage["number"]]
    if not stage_cases:
        continue
    max_score += stage["points"]
    score += round(stage["points"] * sum(1 for case in stage_cases if case["passed"]) / len(stage_cases))

print(json.dumps({
    "verdict": "accepted" if all(case["passed"] for case in outcomes) else "wrong_answer",
    "score": score,
    "maxScore": max_score,
    "cases": outcomes,
    "durationMs": round((time.monotonic() - started) * 1000),
}))
'''

TS_CALL_RUNNER = r'''
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const payload = JSON.parse(readFileSync("/work/payload.json", "utf8"));
const runtime = payload.problem.runtimes.find((item) => item.language === payload.request.runtime);
const cases = (payload.request.kind === "run" ? payload.bundle.visibleCases : [...payload.bundle.visibleCases, ...payload.bundle.hiddenCases]).filter((item) => !payload.request.maxStage || item.stage <= payload.request.maxStage);
const imported = await import(pathToFileURL("/work/solution.mjs").href + "?v=" + Date.now());
const Constructor = imported[runtime.entrypoint.symbol];
if (typeof Constructor !== "function") throw new Error("Símbolo exportado não encontrado: " + runtime.entrypoint.symbol);
const outcomes = [];
const jsonValue = (value) => { try { return JSON.parse(JSON.stringify(value) ?? '"[undefined]"'); } catch { return String(value); } };
for (const test of cases) {
  let mismatch;
  try {
    const instance = new Constructor(...test.constructorArgs);
    for (const call of test.calls) {
      const methodName = runtime.entrypoint.methodMap[call.method] || call.method;
      const input = jsonValue(call.args);
      const actual = await instance[methodName](...call.args);
      if (JSON.stringify(actual) !== JSON.stringify(call.expected)) {
        mismatch = { expected: jsonValue(call.expected), actual: jsonValue(actual), method: call.method, input };
        throw new Error("Resultado incorreto em " + methodName);
      }
    }
    outcomes.push({ id: test.id, name: test.name, stage: test.stage, passed: true });
  } catch (error) {
    outcomes.push({ id: test.id, name: test.name, stage: test.stage, passed: false, message: error instanceof Error ? error.message : String(error), ...(mismatch ? { mismatch } : {}) });
  }
}
let remaining = Math.max(0, payload.problem.limits.outputBytes - Buffer.byteLength(JSON.stringify(outcomes.map(({ mismatch, ...outcome }) => outcome))) - 1);
for (const outcome of outcomes) {
  const mismatch = outcome.mismatch;
  delete outcome.mismatch;
  if (!mismatch) continue;
  if (mismatch.input !== undefined && Buffer.byteLength(JSON.stringify(mismatch.input)) > 2048) delete mismatch.input;
  const addedBytes = Buffer.byteLength(JSON.stringify({ ...outcome, mismatch })) - Buffer.byteLength(JSON.stringify(outcome));
  if (addedBytes <= 4096 && addedBytes <= remaining) {
    outcome.mismatch = mismatch;
    remaining -= addedBytes;
  }
}
console.log(JSON.stringify(outcomes));
'''

PY_CALL_RUNNER = r'''
import importlib.util, inspect, json
payload = json.load(open("/work/payload.json", encoding="utf-8"))
runtime = next(item for item in payload["problem"]["runtimes"] if item["language"] == payload["request"]["runtime"])
cases = payload["bundle"]["visibleCases"] if payload["request"]["kind"] == "run" else payload["bundle"]["visibleCases"] + payload["bundle"]["hiddenCases"]
if payload["request"].get("maxStage"):
    cases = [item for item in cases if item["stage"] <= payload["request"]["maxStage"]]
spec = importlib.util.spec_from_file_location("solution", "/work/solution.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
constructor = getattr(module, runtime["entrypoint"]["symbol"])
outcomes = []
def json_value(value):
    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError):
        return repr(value)
for test in cases:
    mismatch = None
    try:
        instance = constructor(*test.get("constructorArgs", []))
        for call in test["calls"]:
            name = runtime["entrypoint"].get("methodMap", {}).get(call["method"], call["method"])
            call_input = json_value(call["args"])
            actual = getattr(instance, name)(*call["args"])
            if inspect.isawaitable(actual):
                raise RuntimeError("Métodos assíncronos não são suportados")
            if actual != call["expected"]:
                mismatch = {"expected": json_value(call["expected"]), "actual": json_value(actual), "method": call["method"], "input": call_input}
                raise AssertionError(f"Resultado incorreto em {name}")
        outcomes.append({"id": test["id"], "name": test["name"], "stage": test["stage"], "passed": True})
    except Exception as error:
        outcomes.append({"id": test["id"], "name": test["name"], "stage": test["stage"], "passed": False, "message": str(error), **({"mismatch": mismatch} if mismatch is not None else {})})
legacy = [{key: value for key, value in outcome.items() if key != "mismatch"} for outcome in outcomes]
remaining = max(0, int(payload["problem"]["limits"]["outputBytes"]) - len(json.dumps(legacy, ensure_ascii=False).encode("utf-8")) - 1)
for outcome in outcomes:
    mismatch = outcome.pop("mismatch", None)
    if mismatch is None:
        continue
    if "input" in mismatch and len(json.dumps(mismatch["input"], ensure_ascii=False).encode("utf-8")) > 2048:
        del mismatch["input"]
    added_bytes = len(json.dumps({**outcome, "mismatch": mismatch}, ensure_ascii=False).encode("utf-8")) - len(json.dumps(outcome, ensure_ascii=False).encode("utf-8"))
    if added_bytes <= 4096 and added_bytes <= remaining:
        outcome["mismatch"] = mismatch
        remaining -= added_bytes
print(json.dumps(outcomes, ensure_ascii=False))
'''


@app.function(
    image=controller_image,
    secrets=[modal.Secret.from_name("silogium-judge-token")],
    timeout=45,
)
@modal.fastapi_endpoint(method="POST", docs=False)
def evaluate(payload: dict, request: fastapi.Request):
    from fastapi import HTTPException

    expected = os.environ["AUTH_TOKEN"]
    authorization = request.headers.get("authorization", "")
    supplied = authorization.removeprefix("Bearer ")
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="unauthorized")

    runtime = payload.get("request", {}).get("runtime")
    if runtime not in ("typescript", "python"):
        raise HTTPException(status_code=400, detail="runtime inválido")
    source = payload["request"].get("source", "")
    if not source or len(source) > 200_000:
        raise HTTPException(status_code=400, detail="código inválido")

    image = typescript_image if runtime == "typescript" else python_image
    sandbox = modal.Sandbox.create(
        "sleep", "60",
        app=app,
        image=image,
        cpu=(0.25, 1.0),
        memory=(256, 256),
        timeout=30,
        block_network=True,
    )
    started = time.monotonic()
    try:
        sandbox.exec("mkdir", "-p", "/work").wait()
        sandbox.filesystem.write_text(json.dumps(payload), "/work/payload.json")
        sandbox.filesystem.write_text(source, f"/work/solution.{ 'ts' if runtime == 'typescript' else 'py' }")
        sandbox.filesystem.write_text(textwrap.dedent(RUNNER), "/work/runner.py")
        sandbox.filesystem.write_text(textwrap.dedent(TS_CALL_RUNNER), "/work/call_runner.mjs")
        sandbox.filesystem.write_text(textwrap.dedent(PY_CALL_RUNNER), "/work/call_runner.py")
        process = sandbox.exec("python3" if runtime == "typescript" else "python", "/work/runner.py", timeout=30)
        output = process.stdout.read()
        error_output = process.stderr.read()
        process.wait()
        if process.returncode != 0:
            return {
                "id": str(uuid.uuid4()), "verdict": "system_error", "score": 0, "maxScore": 0,
                "durationMs": round((time.monotonic() - started) * 1000), "cases": [],
                "message": error_output[-1000:] or "Falha na infraestrutura do judge."
            }
        result = json.loads(output.strip().splitlines()[-1])
        result["id"] = str(uuid.uuid4())
        return result
    except modal.exception.TimeoutError:
        return {
            "id": str(uuid.uuid4()), "verdict": "time_limit", "score": 0, "maxScore": 0,
            "durationMs": 30_000, "cases": [], "message": "Tempo total de execução excedido."
        }
    except Exception:
        return {
            "id": str(uuid.uuid4()), "verdict": "system_error", "score": 0, "maxScore": 0,
            "durationMs": round((time.monotonic() - started) * 1000), "cases": [],
            "message": "Falha na infraestrutura do judge."
        }
    finally:
        sandbox.terminate()
        sandbox.detach()
