import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from infra.worker.control import (
    WORKER_DISPATCH_RESERVATION_MICROUSD, WakeUnavailable, authorized_wake, dispatch_if_ready, finish_worker_dispatch,
    observe_modal_capacity, queue_has_ready_work, reserve_worker_dispatch,
)


TOKEN = "offline_test_wake_token_not_a_secret_0001"
ENVIRONMENT = {
    "SILOGIUM_AUTHORING_ENABLED": "true",
    "NEXT_PUBLIC_SUPABASE_URL": "https://offlineproject.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "offline_service_role_key",
}


def response(raw=b"true", status=200):
    value = Mock(status=status)
    value.__enter__ = Mock(return_value=value)
    value.__exit__ = Mock(return_value=False)
    value.read.return_value = raw
    return value


class WakeAuthenticationTests(unittest.TestCase):
    def test_bearer_secret_is_exact_and_required(self):
        self.assertTrue(authorized_wake("Bearer " + TOKEN, TOKEN))
        for authorization in ("", "Basic " + TOKEN, "Bearer " + TOKEN + "x", "Bearer ç" + TOKEN):
            with self.subTest(authorization=authorization):
                self.assertFalse(authorized_wake(authorization, TOKEN))
        self.assertFalse(authorized_wake("Bearer ", ""))
        self.assertFalse(authorized_wake("Bearer short", "short"))


class ReadinessTests(unittest.TestCase):
    def test_only_private_readiness_boolean_is_requested(self):
        opener = Mock(return_value=response())
        self.assertTrue(queue_has_ready_work(ENVIRONMENT, open_request=opener))
        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, "https://offlineproject.supabase.co/rest/v1/rpc/authoring_queue")
        self.assertEqual(request.data, b'{"p_action":"ready","p_payload":{}}')
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(opener.call_args.kwargs, {"timeout": 5})

    def test_disabled_does_not_contact_supabase(self):
        opener = Mock()
        self.assertFalse(queue_has_ready_work({**ENVIRONMENT, "SILOGIUM_AUTHORING_ENABLED": "false"}, open_request=opener))
        opener.assert_not_called()

    def test_false_is_idle(self):
        self.assertFalse(queue_has_ready_work(ENVIRONMENT, open_request=Mock(return_value=response(b"false"))))

    def test_invalid_config_cannot_receive_a_service_secret(self):
        for url in ("http://offlineproject.supabase.co", "https://evil.test", "https://offlineproject.supabase.co.evil.test",
                    "https://user:password@offlineproject.supabase.co", "https://offlineproject.supabase.co?query=secret"):
            with self.subTest(url=url):
                opener = Mock()
                with self.assertRaises(WakeUnavailable):
                    queue_has_ready_work({**ENVIRONMENT, "NEXT_PUBLIC_SUPABASE_URL": url}, open_request=opener)
                opener.assert_not_called()

    def test_invalid_response_and_network_errors_fail_closed_without_details(self):
        for raw in (b"{}", b"null", b"1", b'"true"', b"x" * 129):
            with self.subTest(raw=raw):
                with self.assertRaisesRegex(WakeUnavailable, "A verificação da fila não está disponível"):
                    queue_has_ready_work(ENVIRONMENT, open_request=Mock(return_value=response(raw)))
        with self.assertRaises(WakeUnavailable) as caught:
            queue_has_ready_work(ENVIRONMENT, open_request=Mock(side_effect=RuntimeError("private provider body")))
        self.assertNotIn("private", str(caught.exception))


class DispatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_or_paused_queue_never_starts_node_worker(self):
        spawn = AsyncMock()
        reserve = AsyncMock()
        self.assertEqual(await dispatch_if_ready(AsyncMock(return_value=False), spawn, reserve, AsyncMock(), AsyncMock(return_value=True)), "idle")
        spawn.assert_not_awaited()
        reserve.assert_not_awaited()

    async def test_ready_work_spawns_without_any_task_payload(self):
        spawn = AsyncMock()
        self.assertEqual(await dispatch_if_ready(AsyncMock(return_value=True), spawn, AsyncMock(return_value=True), AsyncMock(), AsyncMock(return_value=True)), "scheduled")
        spawn.assert_awaited_once_with()

    async def test_unknown_readiness_never_spawns(self):
        spawn = AsyncMock()
        with self.assertRaises(WakeUnavailable):
            await dispatch_if_ready(AsyncMock(side_effect=WakeUnavailable("offline")), spawn, AsyncMock(), AsyncMock(), AsyncMock(return_value=True))
        spawn.assert_not_awaited()

    async def test_refused_reservation_prevents_spawn(self):
        spawn, finish = AsyncMock(), AsyncMock()
        self.assertEqual(await dispatch_if_ready(AsyncMock(return_value=True), spawn, AsyncMock(return_value=False), finish, AsyncMock(return_value=True)), "capacity_wait")
        spawn.assert_not_awaited()
        finish.assert_not_awaited()

    async def test_spawn_failure_retains_reservation_and_does_not_mark_acknowledged(self):
        finish = AsyncMock()
        with self.assertRaises(RuntimeError):
            await dispatch_if_ready(AsyncMock(return_value=True), AsyncMock(side_effect=RuntimeError("offline")), AsyncMock(return_value=True), finish, AsyncMock(return_value=True))
        finish.assert_not_awaited()

    async def test_acknowledged_spawn_never_repeats_if_finish_rpc_fails(self):
        spawn = AsyncMock()
        self.assertEqual(await dispatch_if_ready(AsyncMock(return_value=True), spawn, AsyncMock(return_value=True), AsyncMock(side_effect=WakeUnavailable("offline")), AsyncMock(return_value=True)), "scheduled")
        spawn.assert_awaited_once_with()

    async def test_repeated_known_capacity_pauses_never_boot_or_reserve_heavy_worker(self):
        ready, spawn, reserve, finish = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
        capacity = AsyncMock(return_value=False)
        for _ in range(20):
            self.assertEqual(await dispatch_if_ready(ready, spawn, reserve, finish, capacity), "capacity_wait")
        self.assertEqual(capacity.await_count, 20)
        for step in (ready, spawn, reserve, finish):
            step.assert_not_awaited()


class FinancialObservationTests(unittest.TestCase):
    def summary(self, cost="0.00", breakdown=None):
        return SimpleNamespace(
            start=datetime(2026, 9, 1, tzinfo=timezone.utc), end=datetime(2026, 10, 1, tzinfo=timezone.utc),
            metered_cost=Decimal(cost), metered_cost_breakdown=breakdown or {"functions": Decimal("0.00131471"), "other": Decimal("0.00001568")},
        )

    def test_preserves_fractional_cost_and_uses_higher_gross_report(self):
        opener = Mock(return_value=response(b'{"modal":{"available":true},"groq":{"available":true}}'))
        self.assertTrue(observe_modal_capacity(ENVIRONMENT, self.summary(), open_request=opener))
        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, "https://offlineproject.supabase.co/rest/v1/rpc/operational_capacity")
        self.assertIn(b'"usageMicrousd":1331', request.data)
        self.assertIn(b'"p_action":"observe_modal"', request.data)
        self.assertIn(b'"cycleEnd":"2026-10-01T00:00:00+00:00"', request.data)

    def test_aggregate_is_used_when_higher_than_breakdown(self):
        opener = Mock(return_value=response(b'{"modal":{"available":true},"groq":{"available":true}}'))
        observe_modal_capacity(ENVIRONMENT, self.summary("10.25"), open_request=opener)
        self.assertIn(b'"usageMicrousd":10250000', opener.call_args.args[0].data)

    def test_missing_attestation_or_exhausted_capacity_never_allows_dispatch(self):
        opener = Mock(return_value=response(b'{"modal":{"available":false,"reason":"verification_required"},"groq":{"available":true}}'))
        self.assertFalse(observe_modal_capacity(ENVIRONMENT, self.summary(), open_request=opener))
        with self.assertRaisesRegex(WakeUnavailable, "capacidade gratuita"):
            observe_modal_capacity(ENVIRONMENT, self.summary(), open_request=Mock(side_effect=RuntimeError("private SQL error")))

    def test_invalid_or_unknown_measurement_fails_closed(self):
        for cost in ("NaN", "Infinity", "-1"):
            with self.subTest(cost=cost):
                opener = Mock()
                with self.assertRaises(WakeUnavailable):
                    observe_modal_capacity(ENVIRONMENT, self.summary(cost), open_request=opener)
                opener.assert_not_called()
        for raw in (b"true", b"{}", b'{"modal":{"available":"true"}}'):
            with self.assertRaises(WakeUnavailable):
                observe_modal_capacity(ENVIRONMENT, self.summary(), open_request=Mock(return_value=response(raw)))

    def test_groq_paused_or_exhausted_also_prevents_authoring_dispatch(self):
        opener = Mock(return_value=response(b'{"modal":{"available":true},"groq":{"available":false,"reason":"paused"}}'))
        self.assertFalse(observe_modal_capacity(ENVIRONMENT, self.summary(), open_request=opener))

    def test_dispatch_ceiling_is_reserved_then_marked_without_a_refund(self):
        reservation_id = "12000000-0000-4000-8000-000000000001"
        opener = Mock(return_value=response(b'{"allowed":true}'))
        self.assertTrue(reserve_worker_dispatch(ENVIRONMENT, reservation_id, open_request=opener))
        self.assertIn(b'"estimateMicrousd":30000', opener.call_args.args[0].data)
        self.assertIn(b'"p_action":"reserve_modal"', opener.call_args.args[0].data)
        opener.return_value = response(b"true")
        finish_worker_dispatch(ENVIRONMENT, reservation_id, open_request=opener)
        self.assertIn(b'"p_action":"finish_modal"', opener.call_args.args[0].data)

    def test_dispatch_reservation_covers_full_hard_cpu_and_ram_not_only_requests(self):
        # app.py: worker 480+30+2s / 1 core / 1GiB, control 40+10+2s / .5 core / .25GiB.
        # Two control invocations plus margin use the same 40/7 rate ceilings
        # as platform-judge.ts, not the cheaper minimum CPU reservation.
        ceiling = (480 + 30 + 2) * (1 * 40 + 1 * 7) + 2 * (40 + 10 + 2) * (.5 * 40 + .25 * 7) + 2_000
        self.assertEqual(ceiling, 28_326)
        self.assertGreaterEqual(WORKER_DISPATCH_RESERVATION_MICROUSD, ceiling)


if __name__ == "__main__":
    unittest.main()
