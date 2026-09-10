"""Lightweight wake control. No model, prompt, job payload or candidate code."""
from __future__ import annotations

import hmac
import json
import re
from collections.abc import Awaitable, Callable, Mapping
from datetime import datetime, timezone
from decimal import Decimal, ROUND_CEILING
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

WORKER_DISPATCH_RESERVATION_MICROUSD = 30_000


class WakeUnavailable(Exception):
    """Operational failure with no provider response or credential in its text."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _open(request, *, timeout):
    return build_opener(_NoRedirect).open(request, timeout=timeout)


def authorized_wake(authorization: str, token: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]{32,512}", token)
                and authorization.startswith("Bearer ")
                and re.fullmatch(r"[A-Za-z0-9_-]{32,512}", authorization[7:])
                and hmac.compare_digest(authorization[7:], token))


def _rpc(environment: Mapping[str, str], name: str, action: str, payload: dict, *, open_request=None):
    source = environment.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    token = environment.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    try:
        url = urlsplit(source)
        if (url.scheme != "https" or not re.fullmatch(r"[a-z0-9]+\.supabase\.co", url.hostname or "")
                or url.username or url.password or url.port or url.query or url.fragment
                or url.path not in ("", "/") or not token):
            raise ValueError("invalid configuration")
        request = Request(
            source.rstrip("/") + "/rest/v1/rpc/" + name,
            data=json.dumps({"p_action": action, "p_payload": payload}, separators=(",", ":")).encode(), method="POST",
            headers={"Authorization": f"Bearer {token}", "apikey": token,
                     "Content-Type": "application/json", "Accept": "application/json"},
        )
        with (open_request or _open)(request, timeout=5) as response:
            if response.status != 200:
                raise ValueError("unexpected response")
            raw = response.read(4097)
        if len(raw) > 4096:
            raise ValueError("oversized response")
        return json.loads(raw)
    except Exception:
        raise WakeUnavailable("A verificação da fila não está disponível.") from None


def queue_has_ready_work(environment: Mapping[str, str], *, open_request=None) -> bool:
    """Read one service-role boolean; never enumerate private jobs or checkpoints."""
    if environment.get("SILOGIUM_AUTHORING_ENABLED") != "true":
        return False
    ready = _rpc(environment, "authoring_queue", "ready", {}, open_request=open_request)
    if not isinstance(ready, bool):
        raise WakeUnavailable("A verificação da fila não está disponível.")
    return ready


def observe_modal_capacity(environment: Mapping[str, str], summary, *, open_request=None) -> bool:
    """Record measured gross workspace usage, never infer entitlement from a card.

    SQL compares this observation to a separately verified financial attestation.
    A billing report may lag: this observation alone is not a no-overage guarantee.
    """
    try:
        values = [summary.metered_cost, *summary.metered_cost_breakdown.values()]
        if any(not isinstance(value, Decimal) or not value.is_finite() or value < 0 for value in values):
            raise ValueError("invalid gross usage")
        cost = max(summary.metered_cost, sum(summary.metered_cost_breakdown.values(), Decimal(0)))
        start, end = summary.start, summary.end
        if any(not isinstance(value, datetime) or value.tzinfo != timezone.utc for value in (start, end)) or end <= start:
            raise ValueError("invalid cycle")
        payload = {
            "cycleStart": start.isoformat(), "cycleEnd": end.isoformat(),
            "usageMicrousd": int((cost * Decimal(1_000_000)).to_integral_value(rounding=ROUND_CEILING)),
        }
        status = _rpc(environment, "operational_capacity", "observe_modal", payload, open_request=open_request)
        if not isinstance(status, dict) or any(not isinstance(status.get(service), dict)
                or not isinstance(status[service].get("available"), bool) for service in ("modal", "groq")):
            raise ValueError("invalid financial status")
        # Known provider waits must not boot a worker just to rediscover the
        # pause. Catalog browsing remains independent from authoring dispatch.
        return status["modal"]["available"] and status["groq"]["available"]
    except Exception:
        raise WakeUnavailable("A capacidade gratuita do Modal não pôde ser verificada.") from None


def reserve_worker_dispatch(environment: Mapping[str, str], reservation_id: str, *, open_request=None) -> bool:
    # This is a conservative reservation, not the invoice for an invocation.
    # At the beta's ceilings of 40 microUSD/core-second and 7/GiB-second:
    # Include hard startup (30s heavy / 10s control) and 2s idle scale-down:
    # (480+30+2)*47 + 2*(40+10+2)*21.75 + 2_000 = 28_326.
    # Reserve 30_000 for the worker, two control calls and additional margin.
    # Revisit this bound if app.py's hard resources or the pinned rates change.
    value = _rpc(environment, "operational_capacity", "reserve_modal", {
        "id": reservation_id, "estimateMicrousd": WORKER_DISPATCH_RESERVATION_MICROUSD,
    }, open_request=open_request)
    if not isinstance(value, dict) or not isinstance(value.get("allowed"), bool):
        raise WakeUnavailable("A reserva gratuita do worker não pôde ser verificada.")
    return value["allowed"]


def finish_worker_dispatch(environment: Mapping[str, str], reservation_id: str, *, open_request=None) -> None:
    # Finishing never releases the conservative estimate from the cycle ledger.
    result = _rpc(environment, "operational_capacity", "finish_modal", {"id": reservation_id}, open_request=open_request)
    if result is not True:
        raise WakeUnavailable("A reserva do worker não pôde ser confirmada.")


async def dispatch_if_ready(
    readiness: Callable[[], Awaitable[bool]],
    spawn: Callable[[], Awaitable[object]],
    reserve: Callable[[], Awaitable[bool]],
    finish: Callable[[], Awaitable[None]],
    capacity: Callable[[], Awaitable[bool]],
) -> str:
    if not await capacity():
        return "capacity_wait"
    if not await readiness():
        return "idle"
    if not await reserve():
        return "capacity_wait"
    await spawn()
    try:
        await finish()
    except Exception:
        # Dispatch was acknowledged. Never retry here or release its reservation
        # just because this diagnostic flag failed to persist.
        pass
    return "scheduled"
