"""Authenticated Modal judge v2. Deploy with: modal deploy -m infra.modal.app.

Only this trusted controller receives expected values. Candidate sandboxes are
fresh per case, contain no controller/payload/references, and return raw values.
"""
from __future__ import annotations

import asyncio
import hmac
import math
import os

import fastapi
import modal

from infra.modal.candidate_runtime import candidate_files
from infra.modal.controller import (
    CandidateCase, CandidateFailure, MAX_PAYLOAD_BYTES, PROTOCOL_VERSION,
    ProcessOutput, evaluate_payload, parse_json,
)

app = modal.App("silogium-judge")
controller_image = (
    modal.Image.debian_slim(python_version="3.13")
    .uv_pip_install("fastapi[standard]==0.139.2")
    .add_local_python_source("infra.modal")
)
# These images are independent from controller_image. Never mount source trees,
# secrets, volumes, snapshots of used sandboxes, or the controller image here.
typescript_image = (
    modal.Image.from_registry("node:22.22.0-bookworm-slim")
    .run_commands("npm install --global esbuild@0.25.12")
)
python_image = modal.Image.from_registry("python:3.13.11-slim")


async def collect_output(process, *, output_bytes, timeout_seconds):
    """Read both byte streams concurrently, stopping before retaining >limit.

    Never use StreamReader.read(): it buffers arbitrary candidate output until EOF.
    The owning executor terminates the whole sandbox on ANY exit from this function.
    """
    buffers = [bytearray(), bytearray()]
    size = 0

    async def read(stream, destination):
        nonlocal size
        async for chunk in stream:
            if not isinstance(chunk, bytes):
                raise RuntimeError("Leitura do sandbox não está em modo binário")
            size += len(chunk)
            if size > output_bytes:
                raise CandidateFailure("output_limit", "Limite de saída excedido.")
            destination.extend(chunk)

    readers = [asyncio.create_task(read(process.stdout, buffers[0])),
               asyncio.create_task(read(process.stderr, buffers[1])),
               asyncio.create_task(process.wait.aio())]
    try:
        await asyncio.wait_for(asyncio.gather(*readers), timeout=timeout_seconds)
    finally:
        for task in readers:
            if not task.done():
                task.cancel()
        await asyncio.gather(*readers, return_exceptions=True)
    return ProcessOutput(bytes(buffers[0]), bytes(buffers[1]), process.returncode)


class ModalCaseExecutor:
    async def run(self, case: CandidateCase) -> ProcessOutput:
        sandbox = None
        executing_candidate = False
        try:
            sandbox = await modal.Sandbox.create.aio(
                "sleep", "30", app=app,
                image=typescript_image if case.runtime == "typescript" else python_image,
                cpu=(0.25, 1.0), memory=(case.memory_mib, case.memory_mib),
                timeout=30, block_network=True,
                secrets=[], env={}, include_oidc_identity_token=False,
            )
            # write_text creates parent directories. No candidate has run yet.
            for path, content in candidate_files(case).items():
                await sandbox.filesystem.write_text.aio(content, path)

            # Compilation receives EOF on stdin and no expected values. Keep it
            # inside this disposable sandbox, but outside the candidate timer.
            command = (["esbuild", "/work/solution.ts", "--format=esm", "--platform=node", "--target=node22", "--outfile=/work/solution.mjs"]
                       if case.runtime == "typescript" else ["python", "-I", "-m", "py_compile", "/work/solution.py"])
            # Fixed shell text only: command/paths are controller literals, never
            # source or fixture strings. exec replaces the shell (same exit code).
            compiled = await sandbox.exec.aio("sh", "-c", 'exec "$@" < /dev/null', "silogium-compile", *command,
                                             timeout=10, text=False, bufsize=-1)
            compilation = await collect_output(compiled, output_bytes=case.output_bytes, timeout_seconds=10)
            if compilation.returncode != 0:
                raise CandidateFailure("compile_error", "Não foi possível compilar a solução.", compilation.stderr.decode("utf-8", errors="replace"))

            extension = "mjs" if case.runtime == "typescript" else "py"
            script = f"/work/{'solution' if case.execution_model == 'stdio' else 'call_runner'}.{extension}"
            command = ["node", script] if case.runtime == "typescript" else ["python", "-I", script]
            redirect = 'exec "$@" < /work/stdin.txt' if case.execution_model == "stdio" else 'exec "$@" < /dev/null'
            process = await sandbox.exec.aio("sh", "-c", redirect, "silogium-candidate", *command,
                                           timeout=max(1, math.ceil(case.time_ms / 1000)), text=False, bufsize=-1)
            executing_candidate = True
            output = await collect_output(process, output_bytes=case.output_bytes, timeout_seconds=case.time_ms / 1000)
            if output.returncode in (-9, 137):
                # Unix SIGKILL is compatible with OOM but not proof of its cause.
                raise CandidateFailure("memory_limit", "Processo encerrado pelo limite de recursos.")
            return output
        except (TimeoutError, modal.exception.TimeoutError):
            if executing_candidate:
                raise CandidateFailure("time_limit", "Tempo limite por caso excedido.") from None
            raise CandidateFailure("system_error", "O judge excedeu o prazo de preparação da execução.") from None
        except CandidateFailure:
            raise
        except Exception:
            raise CandidateFailure("system_error", "Falha na infraestrutura do judge.") from None
        finally:
            if sandbox is not None:
                # No reuse, even after success. A runaway descendant cannot live
                # into another test. The platform's lifetime is a second bound.
                try:
                    await asyncio.wait_for(sandbox.terminate.aio(), timeout=2)
                except Exception:
                    pass
                finally:
                    try:
                        await asyncio.wait_for(sandbox.detach.aio(), timeout=1)
                    except Exception:
                        pass


@app.function(image=controller_image, secrets=[modal.Secret.from_name("silogium-judge-token")], timeout=40, startup_timeout=10,
              cpu=(0.125, 1.0), memory=(256, 256), min_containers=0,
              max_containers=2, buffer_containers=0, scaledown_window=2)
@modal.fastapi_endpoint(method="POST", docs=False)
async def evaluate(request: fastapi.Request):
    expected = os.environ.get("AUTH_TOKEN", "")
    authorization = request.headers.get("authorization", "")
    if not expected or not authorization.startswith("Bearer ") or not hmac.compare_digest(authorization[7:], expected):
        raise fastapi.HTTPException(status_code=401, detail="unauthorized")
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > MAX_PAYLOAD_BYTES:
            raise fastapi.HTTPException(status_code=413, detail="payload too large")
        raw.extend(chunk)
    try:
        payload = parse_json(bytes(raw))
        if not isinstance(payload, dict) or payload.get("protocolVersion") != PROTOCOL_VERSION:
            raise ValueError("invalid protocol")
        request_id = payload["requestId"]
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 100:
            raise ValueError("invalid request ID")
    except (ValueError, KeyError, RecursionError, UnicodeError):
        raise fastapi.HTTPException(status_code=400, detail="invalid judge v2 payload") from None
    result = await evaluate_payload(payload, ModalCaseExecutor())
    return {"protocolVersion": PROTOCOL_VERSION, "requestId": request_id, "result": result}
