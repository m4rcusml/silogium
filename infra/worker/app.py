"""Deploy explicitly: modal deploy -m infra.worker.app. No web endpoint is exposed."""
import os
import subprocess

import modal

app = modal.App("silogium-authoring")
# Allowlisted application directories, never the repository root or local credentials.
image = (
    modal.Image.from_registry("node:22.22.0-bookworm-slim", add_python="3.13")
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
    .add_local_file("infra/worker/run.ts", "/app/infra/worker/run.ts", copy=True)
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("silogium-authoring-worker")],
    schedule=modal.Period(minutes=1),
    timeout=900,
    max_containers=2,
    memory=1024,
)
def process_authoring():
    # This trusted process needs network access to Supabase, sources and the AI adapter.
    # Untrusted generated solutions execute only through the separately isolated judge.
    environment = {**os.environ, "NODE_ENV": "production", "MODAL_IS_REMOTE": "1"}
    subprocess.run(
        ["node", "--import", "tsx", "infra/worker/run.ts", "--once"],
        cwd="/app", env=environment, check=True, timeout=850,
    )
