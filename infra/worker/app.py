"""On-demand authoring plus a lightweight recovery sweep. Deploy explicitly."""
import asyncio
import os
import subprocess
import uuid

import fastapi
import modal

from infra.worker.control import (
    WakeUnavailable, authorized_wake, dispatch_if_ready, finish_worker_dispatch,
    observe_modal_capacity, queue_has_ready_work, reserve_worker_dispatch,
)

app = modal.App("silogium-authoring")
# The wake controller has no Groq/judge secret and never imports the Node worker.
control_image = (
    modal.Image.debian_slim(python_version="3.13")
    .uv_pip_install("fastapi[standard]==0.139.2")
    .add_local_python_source("infra.worker")
)
# Allowlisted application directories, never the repository root or local credentials.
image = (
    modal.Image.from_registry("node:22.22.0-bookworm-slim", add_python="3.13")
    .uv_pip_install("fastapi[standard]==0.139.2")
    .workdir("/app")
    .add_local_file("package.json", "/app/package.json", copy=True)
    .add_local_file("package-lock.json", "/app/package-lock.json", copy=True)
    .add_local_file("tsconfig.json", "/app/tsconfig.json", copy=True)
    .add_local_file("apps/web/package.json", "/app/apps/web/package.json", copy=True)
    .add_local_dir("packages", "/app/packages", copy=True, ignore=[
        "**/node_modules/**", "**/.env*", "**/*.private.json", "**/*.reference.*",
        "**/test/**", "**/__pycache__/**", "**/*.tsbuildinfo",
    ])
    .run_commands("npm ci --include=dev --ignore-scripts")
    .add_local_dir("apps/web/lib", "/app/apps/web/lib", copy=True)
    .add_local_dir("infra/worker", "/app/infra/worker", copy=True, ignore=[
        "**/test_*.py", "**/__pycache__/**", "**/*.pyc",
    ])
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("silogium-authoring-worker")],
    timeout=480,
    startup_timeout=30,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=2,
    cpu=(0.125, 1.0),
    memory=(1024, 1024),
)
def process_authoring():
    # This trusted process needs network access to Supabase, sources and the AI adapter.
    # Untrusted generated solutions execute only through the separately isolated judge.
    environment = {**os.environ, "NODE_ENV": "production", "MODAL_IS_REMOTE": "1"}
    subprocess.run(
        ["node", "--import", "tsx", "infra/worker/run.ts", "--drain"],
        cwd="/app", env=environment, check=True, timeout=450,
    )


async def _dispatch():
    async def capacity():
        # The native container context identifies its workspace. No personal
        # access token or guessed balance is embedded in either image.
        expected = os.environ.get("SILOGIUM_MODAL_WORKSPACE", "").strip()
        if not expected:
            raise WakeUnavailable("Workspace financeiro não configurado.")
        workspace = modal.Workspace.from_context()
        await workspace.hydrate.aio()
        if workspace.name != expected:
            raise WakeUnavailable("Workspace financeiro incompatível.")
        summary = await workspace.billing.summary.aio()
        return await asyncio.to_thread(observe_modal_capacity, os.environ, summary)

    # Refresh even when the queue is empty: standalone judge submissions also
    # require a recent, separately attested capacity observation in PostgreSQL.
    async def available():
        return await asyncio.wait_for(capacity(), timeout=12)

    async def ready():
        return await asyncio.to_thread(queue_has_ready_work, os.environ)

    reservation_id = str(uuid.uuid4())

    async def reserve():
        return await asyncio.to_thread(reserve_worker_dispatch, os.environ, reservation_id)

    async def finish():
        await asyncio.to_thread(finish_worker_dispatch, os.environ, reservation_id)

    return await dispatch_if_ready(ready, process_authoring.spawn.aio, reserve, finish, available)


@app.function(
    image=control_image,
    secrets=[modal.Secret.from_name("silogium-authoring-wakeup")],
    timeout=40, startup_timeout=10, min_containers=0, max_containers=1, buffer_containers=0,
    scaledown_window=2, cpu=(0.125, 0.5), memory=(256, 256),
)
@modal.fastapi_endpoint(method="POST", docs=False)
async def wake(request: fastapi.Request):
    # Authentication precedes body inspection, readiness and any costly dispatch.
    if not authorized_wake(request.headers.get("authorization", ""), os.environ.get("SILOGIUM_WORKER_WAKE_TOKEN", "")):
        raise fastapi.HTTPException(status_code=401, detail="unauthorized")
    async for chunk in request.stream():
        if chunk:
            raise fastapi.HTTPException(status_code=400, detail="wake requests must be empty")
    try:
        status = await _dispatch()
    except Exception:
        raise fastapi.HTTPException(status_code=503, detail="worker wake unavailable") from None
    return fastapi.responses.JSONResponse({"status": status}, status_code=202)


@app.function(
    image=control_image,
    secrets=[modal.Secret.from_name("silogium-authoring-wakeup")],
    schedule=modal.Period(minutes=5),
    timeout=40, startup_timeout=10, min_containers=0, max_containers=1, buffer_containers=0,
    scaledown_window=2, cpu=(0.125, 0.5), memory=(256, 256),
)
async def recover_authoring():
    # Lost wakeups, leases and completed capacity windows recover from PostgreSQL.
    # Empty/paused queues never boot the heavier Node/Groq image.
    try:
        status = await _dispatch()
    except Exception:
        raise WakeUnavailable("A recuperação do worker não está disponível.") from None
    print({"event": "authoring_recovery", "status": status})
