"""Exercise the deployed control functions without SDK, credentials or network."""
import ast
import asyncio
import io
import unittest
import uuid
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from infra.worker.control import WakeUnavailable, dispatch_if_ready


def control_functions():
    source = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
    functions = [node for node in source.body if isinstance(node, ast.AsyncFunctionDef)
                 and node.name in ("_dispatch", "recover_authoring")]
    for function in functions:
        function.decorator_list = []
    workspace = SimpleNamespace(name="offline", hydrate=SimpleNamespace(aio=AsyncMock()),
                                billing=SimpleNamespace(summary=SimpleNamespace(aio=AsyncMock(return_value="summary"))))
    namespace = dict(asyncio=asyncio, uuid=uuid, os=SimpleNamespace(environ={"SILOGIUM_MODAL_WORKSPACE": "offline"}),
                     modal=SimpleNamespace(Workspace=SimpleNamespace(from_context=Mock(return_value=workspace))),
                     WakeUnavailable=WakeUnavailable, dispatch_if_ready=dispatch_if_ready,
                     observe_modal_capacity=Mock(return_value=False), queue_has_ready_work=Mock(return_value=True),
                     reserve_worker_dispatch=Mock(return_value=True), finish_worker_dispatch=Mock(),
                     process_authoring=SimpleNamespace(spawn=SimpleNamespace(aio=AsyncMock())))
    exec(compile(ast.Module(body=functions, type_ignores=[]), "app.py", "exec"), namespace)
    return namespace, workspace


class ControlAppTests(unittest.IsolatedAsyncioTestCase):
    async def test_expected_capacity_wait_is_successful_recovery_without_dispatch(self):
        namespace, _ = control_functions()
        output = io.StringIO()
        with redirect_stdout(output):
            await namespace["recover_authoring"]()
        self.assertIn("capacity_wait", output.getvalue())
        namespace["queue_has_ready_work"].assert_not_called()
        namespace["reserve_worker_dispatch"].assert_not_called()
        namespace["process_authoring"].spawn.aio.assert_not_awaited()

    async def test_database_outage_keeps_its_safe_error_code_in_remote_logs(self):
        namespace, _ = control_functions()
        namespace["observe_modal_capacity"].side_effect = WakeUnavailable("private body", code="database_transport")
        output = io.StringIO()
        with redirect_stdout(output), self.assertRaises(WakeUnavailable):
            await namespace["recover_authoring"]()
        self.assertIn("database_transport", output.getvalue())
        self.assertNotIn("private", output.getvalue())
        namespace["process_authoring"].spawn.aio.assert_not_awaited()

    async def test_billing_outage_is_distinguished_from_database_outage(self):
        namespace, workspace = control_functions()
        workspace.billing.summary.aio.side_effect = RuntimeError("private provider response")
        with self.assertRaises(WakeUnavailable) as caught:
            await namespace["_dispatch"]()
        self.assertEqual(caught.exception.code, "billing_unavailable")
        self.assertNotIn("private", str(caught.exception))
        namespace["observe_modal_capacity"].assert_not_called()

    async def test_wrong_workspace_never_reads_billing_or_records_usage(self):
        namespace, workspace = control_functions()
        workspace.name = "other"
        with self.assertRaises(WakeUnavailable) as caught:
            await namespace["_dispatch"]()
        self.assertEqual(caught.exception.code, "workspace_mismatch")
        workspace.billing.summary.aio.assert_not_awaited()
        namespace["observe_modal_capacity"].assert_not_called()


if __name__ == "__main__":
    unittest.main()
