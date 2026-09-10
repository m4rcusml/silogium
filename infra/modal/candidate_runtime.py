"""Untrusted-side launch assets. They know inputs and return values, not answers.

Treat these wrappers as candidate-controlled: changing/imitating them cannot set
the controller verdict. Strings from entrypoints stay JSON data, never source.
"""
import json

TS_CALL_RUNNER = r'''
import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync("/work/input.json", "utf8"));
const { entrypoint, constructorArgs, calls } = input;
const imported = await import("./solution.mjs");
const Constructor = imported[entrypoint.symbol];
if (typeof Constructor !== "function") throw new Error("Símbolo exportado não encontrado");
const instance = new Constructor(...constructorArgs);
const values = [];
for (const call of calls) {
  const method = Object.hasOwn(entrypoint.methodMap, call.method) ? entrypoint.methodMap[call.method] : call.method;
  if (typeof instance[method] !== "function") throw new Error("Método não encontrado");
  const value = await instance[method](...call.args);
  // Missing/undefined values remain invalid, never implicitly become null.
  values.push({ value });
}
process.stdout.write(JSON.stringify(values));
'''

PY_CALL_RUNNER = r'''
import importlib.util, inspect, json
with open("/work/input.json", encoding="utf-8") as handle:
    data = json.load(handle)
spec = importlib.util.spec_from_file_location("solution", "/work/solution.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
instance = getattr(module, data["entrypoint"]["symbol"])(*data["constructorArgs"])
values = []
for call in data["calls"]:
    name = data["entrypoint"]["methodMap"].get(call["method"], call["method"])
    value = getattr(instance, name)(*call["args"])
    if inspect.isawaitable(value):
        raise RuntimeError("Métodos assíncronos não são suportados no runner Python")
    values.append({"value": value})
print(json.dumps(values, ensure_ascii=False, allow_nan=False))
'''


def candidate_files(case):
    extension = "ts" if case.runtime == "typescript" else "py"
    files = {f"/work/solution.{extension}": case.source}
    if case.execution_model == "call-sequence":
        # Explicit projection: do not serialize a fixture, payload, or __dict__.
        files["/work/input.json"] = json.dumps({
            "entrypoint": case.entrypoint,
            "constructorArgs": case.input["constructorArgs"],
            "calls": case.input["calls"],
        }, ensure_ascii=False, allow_nan=False)
        files["/work/call_runner.mjs" if case.runtime == "typescript" else "/work/call_runner.py"] = (
            TS_CALL_RUNNER if case.runtime == "typescript" else PY_CALL_RUNNER)
    return files
