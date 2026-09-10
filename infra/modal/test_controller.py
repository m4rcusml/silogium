"""Offline regression tests. No Modal SDK, credentials, service or network needed.

Run: python -m unittest discover -s infra/modal -p "test_*.py" -v
"""
import ast
import asyncio
import copy
import dataclasses
import json
from pathlib import Path
import types
import unittest

from infra.modal.candidate_runtime import candidate_files
from infra.modal.controller import CandidateCase, CandidateFailure, ProcessOutput, evaluate_payload, parse_json


def fixture(model="call-sequence", runtime="python", kind="submission"):
    def case(index):
        base = dict(kind=model, id=f"case-{index}", name=f"Secret description {index}", stage=index)
        return {**base, **({"stdin": f"input-{index}", "expectedStdout": f"SECRET-ANSWER-{index}"} if model == "stdio" else {
            "constructorArgs": [], "calls": [{"method": "value", "args": [f"input-{index}"], "expected": f"SECRET-ANSWER-{index}"}],
        })}
    return {
        "protocolVersion": 2, "requestId": "correlation-test",
        "problem": {"id": "problem", "version": 1, "executionModel": model,
                    "stages": [{"number": 1, "points": 150}, {"number": 2, "points": 450}],
                    "limits": {"timeMs": 2000, "memoryMiB": 256, "outputBytes": 65536},
                    "runtimes": [{"language": runtime, "entrypoint": {"kind": "stdio"} if model == "stdio" else {"kind": "class", "symbol": "Solution", "methodMap": {}}}]},
        "bundle": {"problemId": "problem", "problemVersion": 1, "visibleCases": [case(1)], "hiddenCases": [case(2)],
                   "referenceSolutions": {runtime: "SECRET-REFERENCE"}},
        "request": {"kind": kind, "runtime": runtime, "source": "candidate source", "problemId": "problem", "problemVersion": 1},
    }


class FakeExecutor:
    def __init__(self, respond):
        self.respond = respond
        self.received = []

    async def run(self, case):
        self.received.append(case)
        value = self.respond(case)
        return await value if hasattr(value, "__await__") else value


def answers(case):
    index = (case.input["stdin"] if case.execution_model == "stdio" else case.input["calls"][0]["args"][0]).split("-")[-1]
    value = f"SECRET-ANSWER-{index}"
    return ProcessOutput(value.encode() if case.execution_model == "stdio" else json.dumps([{"value": value}]).encode())


class ControllerTests(unittest.IsolatedAsyncioTestCase):
    async def test_never_pass_expected_references_names_ids_or_other_cases_to_executor(self):
        for runtime in ("python", "typescript"):
            for model in ("stdio", "call-sequence"):
                payload = fixture(model, runtime)
                original = copy.deepcopy(payload)
                executor = FakeExecutor(answers)
                result = await evaluate_payload(payload, executor)
                self.assertEqual(result["verdict"], "accepted")
                self.assertEqual((result["score"], result["maxScore"]), (600, 600))
                self.assertEqual(len(executor.received), 2)
                for index, candidate in enumerate(executor.received, 1):
                    transferred = json.dumps(dataclasses.asdict(candidate)) + json.dumps(candidate_files(candidate))
                    for secret in ("SECRET-ANSWER", "SECRET-REFERENCE", "expected", "hiddenCases", "visibleCases", "Secret description", "case-1", "case-2", f"input-{3-index}"):
                        self.assertNotIn(secret, transferred)
                    self.assertNotIn("/work/payload.json", candidate_files(candidate))
                self.assertEqual(payload, original)
                self.assertEqual(result["cases"][1], {"id": "case-2", "name": "Teste oculto", "stage": 2, "passed": True})

    async def test_forged_verdict_case_metadata_and_empty_protocol_do_not_pass(self):
        for forged in (b'{"verdict":"accepted","score":600,"maxScore":600,"cases":[]}',
                       b'[{"passed":true,"id":"case-1","stage":1}]', b'[]',
                       b'[{"value":"SECRET-ANSWER-1","passed":true}]',
                       b'[{"value":"SECRET-ANSWER-1"}]\n{"verdict":"accepted"}',
                       b'[{"value":NaN}]', b'[{"value":1,"value":2}]', b'\xff'):
            result = await evaluate_payload(fixture(), FakeExecutor(lambda _: ProcessOutput(forged)))
            self.assertEqual(result["verdict"], "runtime_error", forged)
            self.assertEqual(result["score"], 0)

    async def test_stdout_json_is_not_a_verdict_for_stdio(self):
        forged = b'{"verdict":"accepted","score":600,"cases":[]}'
        result = await evaluate_payload(fixture("stdio"), FakeExecutor(lambda _: ProcessOutput(forged)))
        self.assertEqual(result["verdict"], "wrong_answer")
        self.assertEqual(result["score"], 0)

    async def test_private_input_and_output_are_not_exposed_in_failure(self):
        result = await evaluate_payload(fixture(), FakeExecutor(lambda _: ProcessOutput(b'[{"value":"private-input-echo"}]')))
        self.assertEqual(result["verdict"], "wrong_answer")
        self.assertIn("mismatch", result["cases"][0])
        self.assertEqual(result["cases"][1], {"id": "case-2", "name": "Teste oculto", "stage": 2, "passed": False})

    async def test_candidate_stderr_never_leaks_from_a_submission_failure(self):
        for kind in ("run", "submission"):
            result = await evaluate_payload(fixture(kind=kind), FakeExecutor(lambda _: ProcessOutput(b"", b"SECRET-INPUT-ECHO", 1)))
            self.assertEqual(result["verdict"], "runtime_error")
            self.assertEqual("SECRET-INPUT-ECHO" in result["message"], kind == "run")

    async def test_large_diagnostics_are_dropped_not_silently_truncated_values(self):
        payload = fixture(kind="run")
        payload["bundle"]["visibleCases"][0]["calls"][0]["expected"] = "large" * 2000
        result = await evaluate_payload(payload, FakeExecutor(lambda _: ProcessOutput(b'[{"value":0}]')))
        self.assertEqual(result["verdict"], "wrong_answer")
        self.assertNotIn("mismatch", result["cases"][0])

    async def test_half_points_round_like_javascript(self):
        payload = fixture("stdio", kind="run")
        payload["problem"]["stages"][0]["points"] = 1
        payload["bundle"]["visibleCases"] *= 2
        payload["bundle"]["visibleCases"][1] = {**payload["bundle"]["visibleCases"][1], "id": "other", "stdin": "wrong"}
        result = await evaluate_payload(payload, FakeExecutor(lambda case: ProcessOutput(b"SECRET-ANSWER-1" if case.input["stdin"] == "input-1" else b"no")))
        self.assertEqual((result["verdict"], result["score"], result["maxScore"]), ("wrong_answer", 1, 1))

    async def test_json_bool_is_not_number_and_object_keys_are_not_order_sensitive(self):
        payload = fixture(kind="run")
        call = payload["bundle"]["visibleCases"][0]["calls"][0]
        call["expected"] = 1
        result = await evaluate_payload(payload, FakeExecutor(lambda _: ProcessOutput(b'[{"value":true}]')))
        self.assertEqual(result["verdict"], "wrong_answer")
        call["expected"] = {"a": 1, "b": 2}
        result = await evaluate_payload(payload, FakeExecutor(lambda _: ProcessOutput(b'[{"value":{"b":2,"a":1}}]')))
        self.assertEqual(result["verdict"], "accepted")

    async def test_copy_prevents_an_executor_mutating_trusted_inputs(self):
        payload = fixture(kind="run")
        def mutate(case):
            case.input["calls"][0]["args"].clear()
            return ProcessOutput(b'[{"value":0}]')
        result = await evaluate_payload(payload, FakeExecutor(mutate))
        self.assertEqual(payload["bundle"]["visibleCases"][0]["calls"][0]["args"], ["input-1"])
        self.assertEqual(result["cases"][0]["mismatch"]["input"], ["input-1"])

    async def test_runs_and_selected_stages_never_execute_future_cases(self):
        for kind, max_stage in (("run", 2), ("submission", 1)):
            payload = fixture(kind=kind)
            payload["request"]["maxStage"] = max_stage
            executor = FakeExecutor(answers)
            result = await evaluate_payload(payload, executor)
            self.assertEqual(len(executor.received), 1)
            self.assertEqual(result["maxScore"], 150)

    async def test_duplicate_empty_invalid_and_old_payloads_fail_closed(self):
        changes = [lambda p: p.pop("protocolVersion"), lambda p: p["bundle"].update(visibleCases=[], hiddenCases=[]),
                   lambda p: p["bundle"]["hiddenCases"][0].update(id="case-1"),
                   lambda p: p["bundle"].update(problemVersion=2),
                   lambda p: p["bundle"]["visibleCases"][0]["calls"][0].pop("expected")]
        for change in changes:
            payload = fixture()
            change(payload)
            executor = FakeExecutor(answers)
            result = await evaluate_payload(payload, executor)
            self.assertEqual(result["verdict"], "system_error")
            self.assertEqual(executor.received, [])

    async def test_policy_caps_content_limits_and_combines_both_output_streams(self):
        payload = fixture()
        payload["problem"]["limits"] = {"timeMs": 30_000, "memoryMiB": 4096, "outputBytes": 1_048_576}
        executor = FakeExecutor(lambda _: ProcessOutput(b"a" * 65536, b"x"))
        result = await evaluate_payload(payload, executor)
        self.assertEqual(result["verdict"], "output_limit")
        self.assertTrue(all((case.time_ms, case.memory_mib, case.output_bytes) == (2000, 256, 65536) for case in executor.received))

    async def test_case_failure_category_is_trusted_executor_not_stdout(self):
        for category in ("compile_error", "runtime_error", "time_limit", "memory_limit", "output_limit"):
            async def fail(_):
                raise CandidateFailure(category, "safe generic failure")
            result = await evaluate_payload(fixture(), FakeExecutor(fail))
            self.assertEqual(result["verdict"], category)
            self.assertEqual(result["cases"], [])

    async def test_slow_provisioning_is_system_error_cancels_active_work(self):
        cancelled = []
        async def slow(_):
            try:
                await asyncio.sleep(10)
            finally:
                cancelled.append(True)
        result = await evaluate_payload(fixture(), FakeExecutor(slow), total_seconds=0.01)
        self.assertEqual(result["verdict"], "system_error")
        self.assertTrue(cancelled)

    async def test_parallelism_is_bounded_and_results_keep_fixture_order(self):
        payload = fixture("stdio", kind="run")
        payload["bundle"]["visibleCases"] = [{"kind": "stdio", "id": str(i), "name": "case", "stage": 1,
                                               "stdin": str(i), "expectedStdout": str(i)} for i in range(20)]
        payload["bundle"]["hiddenCases"] = []
        active = peak = 0
        async def respond(case):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.002)
            active -= 1
            return ProcessOutput(case.input["stdin"].encode())
        result = await evaluate_payload(payload, FakeExecutor(respond), concurrency=500)
        self.assertEqual(peak, 4)
        self.assertEqual([case["id"] for case in result["cases"]], [str(i) for i in range(20)])


# Execute the real adapter definitions with a minimal Modal-shaped fake. This
# tests sandbox options, filesystem projection, byte streaming and cleanup, not
# gVisor/OOM/network isolation (which requires a separately authorized live test).
def adapter_namespace(fake_modal):
    import math
    source = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
    selected = [node for node in source.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                and node.name in ("collect_output", "ModalCaseExecutor")]
    namespace = dict(asyncio=asyncio, math=math, modal=fake_modal, candidate_files=candidate_files,
                     CandidateCase=CandidateCase, CandidateFailure=CandidateFailure, ProcessOutput=ProcessOutput,
                     app="controller-app", typescript_image="ts-candidate-image", python_image="py-candidate-image")
    exec(compile(ast.Module(body=selected, type_ignores=[]), "app.py", "exec"), namespace)
    return namespace


class AsyncMethod:
    def __init__(self, function):
        self.aio = function


class FakeProcess:
    def __init__(self, stdout=(b"ok",), stderr=(), returncode=0):
        async def stream(chunks):
            for chunk in chunks:
                yield chunk
        self.stdout, self.stderr = stream(stdout), stream(stderr)
        self.returncode = returncode
        self.input = bytearray()
        async def wait():
            return self.returncode
        async def drain():
            pass
        self.wait = AsyncMethod(wait)
        self.stdin = types.SimpleNamespace(write=lambda data: self.input.extend(data), write_eof=lambda: None, drain=AsyncMethod(drain))


class FakeSandbox:
    def __init__(self, process, compilation):
        self.files, self.commands = {}, []
        self.terminated = self.detached = False
        self.process = process
        async def write(content, path):
            self.files[path] = content
        async def execute(*args, **options):
            self.commands.append((args, options))
            return compilation if len(self.commands) == 1 else self.process
        async def terminate():
            self.terminated = True
        async def detach():
            self.detached = True
        self.filesystem = types.SimpleNamespace(write_text=AsyncMethod(write))
        self.exec, self.terminate, self.detach = AsyncMethod(execute), AsyncMethod(terminate), AsyncMethod(detach)


class ModalAdapterTests(unittest.IsolatedAsyncioTestCase):
    def adapter(self, make_process=lambda: FakeProcess(), make_compilation=lambda: FakeProcess(stdout=())):
        created = []
        async def create(*args, **options):
            sandbox = FakeSandbox(make_process(), make_compilation())
            created.append((sandbox, args, options))
            return sandbox
        fake = types.SimpleNamespace(Sandbox=types.SimpleNamespace(create=AsyncMethod(create)), exception=types.SimpleNamespace(TimeoutError=TimeoutError))
        return adapter_namespace(fake), created

    async def test_short_stdio_process_does_not_depend_on_rpc_stdin_after_exit(self):
        def already_exited():
            process = FakeProcess(stdout=(b"0\n",))
            async def closed_stdin():
                raise BrokenPipeError("Synthetic process already exited before stdin RPC")
            process.stdin.drain = AsyncMethod(closed_stdin)
            return process
        namespace, created = self.adapter(already_exited)
        case = CandidateCase("python", "print(0)\n", "stdio", {"kind": "stdio"}, {"stdin": "17 -4\n"}, 2000, 65536, 256)
        output = await namespace["ModalCaseExecutor"]().run(case)
        self.assertEqual(output.stdout, b"0\n")
        self.assertEqual(output.returncode, 0)
        self.assertEqual(created[0][0].files["/work/stdin.txt"], "17 -4\n")
        self.assertEqual(created[0][0].commands[1][0], ("sh", "-c", 'exec "$@" < /work/stdin.txt', "silogium-candidate", "python", "-I", "/work/solution.py"))
        self.assertTrue(created[0][0].terminated and created[0][0].detached)

    async def test_stdio_input_remains_data_not_shell_source(self):
        namespace, created = self.adapter()
        injection = '\n"; touch /work/attacker; $(printf injected)\n'
        case = CandidateCase("typescript", "source", "stdio", {"kind": "stdio"}, {"stdin": injection}, 2000, 65536, 256)
        await namespace["ModalCaseExecutor"]().run(case)
        self.assertEqual(created[0][0].files["/work/stdin.txt"], injection)
        self.assertNotIn(injection, repr(created[0][0].commands))

    async def test_new_sandbox_each_case_no_secrets_network_volumes_or_shared_payload(self):
        namespace, created = self.adapter()
        executor = namespace["ModalCaseExecutor"]()
        for runtime in ("typescript", "python"):
            case = CandidateCase(runtime, "source", "stdio", {"kind": "stdio"}, {"stdin": "current only"}, 2000, 65536, 256)
            await executor.run(case)
        self.assertEqual(len(created), 2)
        self.assertIsNot(created[0][0], created[1][0])
        for sandbox, args, options in created:
            self.assertEqual(args, ("sleep", "30"))
            self.assertEqual(options["memory"], (256, 256))
            self.assertEqual(options["timeout"], 30)
            self.assertTrue(options["block_network"])
            self.assertEqual(options["secrets"], [])
            self.assertEqual(options["env"], {})
            self.assertFalse(options["include_oidc_identity_token"])
            self.assertNotIn("volumes", options)
            self.assertNotIn("controller", options["image"])
            self.assertEqual(len(sandbox.files), 2)
            self.assertNotIn("payload", " ".join(sandbox.files))
            self.assertEqual(sandbox.files["/work/stdin.txt"], "current only")
            self.assertEqual(sandbox.process.input, b"")
            self.assertTrue(sandbox.terminated and sandbox.detached)
            for _, options in sandbox.commands:
                self.assertFalse(options["text"])
                self.assertEqual(options["bufsize"], -1)
            self.assertEqual(sandbox.commands[0][0][:4], ("sh", "-c", 'exec "$@" < /dev/null', "silogium-compile"))

    async def test_output_overflow_terminates_sandbox_without_unbounded_read(self):
        namespace, created = self.adapter(lambda: FakeProcess(stdout=(b"a" * 65536, b"overflow")))
        case = CandidateCase("python", "source", "stdio", {"kind": "stdio"}, {"stdin": ""}, 2000, 65536, 256)
        with self.assertRaises(CandidateFailure) as failure:
            await namespace["ModalCaseExecutor"]().run(case)
        self.assertEqual(failure.exception.verdict, "output_limit")
        self.assertTrue(created[0][0].terminated and created[0][0].detached)

    async def test_candidate_timeout_compile_failure_setup_timeout_and_sigkill_are_separate(self):
        def timed_process():
            process = FakeProcess(stdout=())
            async def wait():
                await asyncio.sleep(10)
            process.wait = AsyncMethod(wait)
            return process
        def timeout_during_setup():
            process = FakeProcess(stdout=())
            async def wait():
                raise TimeoutError("SDK compiler timeout")
            process.wait = AsyncMethod(wait)
            return process
        variants = [(timed_process, lambda: FakeProcess(stdout=()), "time_limit"),
                    (lambda: FakeProcess(), lambda: FakeProcess(returncode=1, stderr=(b"syntax",)), "compile_error"),
                    (lambda: FakeProcess(), timeout_during_setup, "system_error"),
                    (lambda: FakeProcess(returncode=137), lambda: FakeProcess(stdout=()), "memory_limit")]
        for make_process, make_compilation, category in variants:
            namespace, created = self.adapter(make_process, make_compilation)
            case = CandidateCase("python", "source", "stdio", {"kind": "stdio"}, {"stdin": ""}, 20, 65536, 256)
            with self.assertRaises(CandidateFailure) as failure:
                await namespace["ModalCaseExecutor"]().run(case)
            self.assertEqual(failure.exception.verdict, category)
            self.assertTrue(created[0][0].terminated and created[0][0].detached)

    async def test_input_mapping_strings_stay_json_not_generated_source(self):
        namespace, created = self.adapter(lambda: FakeProcess(stdout=(b"[{\"value\":1}]",)))
        injection = '\"); process.stdout.write("attack"); //'
        case = CandidateCase("typescript", "source", "call-sequence", {"kind": "class", "symbol": injection, "methodMap": {"value": injection}},
                             {"constructorArgs": [], "calls": [{"method": "value", "args": []}]}, 2000, 65536, 256)
        await namespace["ModalCaseExecutor"]().run(case)
        files = created[0][0].files
        self.assertEqual(json.loads(files["/work/input.json"])["entrypoint"]["symbol"], injection)
        self.assertNotIn(injection, files["/work/call_runner.mjs"])
        self.assertNotIn(injection, repr(created[0][0].commands))


if __name__ == "__main__":
    unittest.main()
