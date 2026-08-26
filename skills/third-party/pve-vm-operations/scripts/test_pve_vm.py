#!/usr/bin/env python3

from __future__ import annotations

import io
import http.client
import json
import os
import sys
import unittest
import urllib.error
import urllib.parse
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(SCRIPT_DIR))

import pve_vm  # noqa: E402


VALID_UPID = "UPID:node-a:00000001:00000002:00000003:qmstart:100:user@pam:"
DESTROY_UPID = "UPID:node-a:00000001:00000002:00000003:qmdestroy:100:user@pam:"


class FakeResponse:
    def __init__(self, data):
        self.payload = json.dumps({"data": data}).encode("utf-8")

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def close(self):
        pass


class FailingReadResponse(FakeResponse):
    def __init__(self, error):
        self.error = error

    def read(self):
        raise self.error


class FakeOpen:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, **kwargs):
        self.requests.append(request)
        if not self.responses:
            raise AssertionError("unexpected network request")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return FakeResponse(response)


class PVETest(unittest.TestCase):
    def test_redirects_are_rejected_before_credentials_can_be_forwarded(self):
        request = pve_vm.urllib.request.Request(
            "https://pve.example.test:8006/api2/json/version",
            headers={
                "Authorization": "PVEAPIToken=user@pam!test=private-token",
                "Cookie": "PVEAuthCookie=private-ticket",
                "CSRFPreventionToken": "private-csrf",
            },
        )
        handler = pve_vm.RejectRedirectHandler()
        with self.assertRaisesRegex(pve_vm.PVEError, "redirect"):
            handler.redirect_request(
                request,
                None,
                302,
                "Found",
                {},
                "http://attacker.example.test/collect",
            )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="token-uuid",
        )
        self.assertTrue(
            any(
                isinstance(item, pve_vm.RejectRedirectHandler)
                for item in client.opener.handlers
            )
        )

    def test_normalize_endpoint(self):
        self.assertEqual(
            pve_vm.normalize_endpoint("pve.example.test:8006/"),
            "https://pve.example.test:8006/api2/json",
        )
        self.assertEqual(
            pve_vm.normalize_endpoint("https://pve.example.test:8006/api2/json"),
            "https://pve.example.test:8006/api2/json",
        )
        with self.assertRaises(pve_vm.PVEError):
            pve_vm.normalize_endpoint("http://pve.example.test:8006")
        with self.assertRaises(pve_vm.PVEError):
            pve_vm.normalize_endpoint("https://user:password@pve.example.test:8006")
        with self.assertRaises(pve_vm.PVEError):
            pve_vm.normalize_endpoint("https://pve.example.test:not-a-port")

    def test_node_name_matches_official_pve_grammar(self):
        for valid in ("a", "node-a", "NODE123"):
            with self.subTest(valid=valid):
                self.assertEqual(pve_vm.validate_node(valid), valid)
        for invalid in ("-node", "node-", "node.example", "node_1"):
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(pve_vm.PVEError, "node name"):
                    pve_vm.validate_node(invalid)

    def test_upid_matches_official_pve_grammar(self):
        self.assertEqual(pve_vm.validate_upid(VALID_UPID), VALID_UPID)
        nine_digit_pstart = (
            "UPID:node-a:00000001:000000002:00000003:qmstart:100:user@pam:"
        )
        self.assertEqual(pve_vm.validate_upid(nine_digit_pstart), nine_digit_pstart)

        invalid_upids = (
            "UPID:node-a:1:2:3:qmstart:100:user@pam:",
            "UPID:node-a:00000001:00000002:00000003:qm/start:100:user@pam:",
            "UPID:node-a:00000001:00000002:00000003:qmstart:100:user/name:",
            "UPID:node-a:00000001:00000002:00000003:qmstart:100:user@pam:extra:",
        )
        for upid in invalid_upids:
            with self.subTest(upid=upid):
                with self.assertRaisesRegex(pve_vm.PVEError, "valid UPID"):
                    pve_vm.validate_upid(upid)

    def test_sensitive_parameter_requires_environment_reference(self):
        with self.assertRaisesRegex(pve_vm.PVEError, "secret-param-env"):
            pve_vm.parse_parameter("cipassword=plain-text")
        self.assertEqual(
            pve_vm.parse_secret_parameter("cipassword=PVE_CI_PASSWORD"),
            pve_vm.SecretParameter("cipassword", "PVE_CI_PASSWORD"),
        )

    def test_opaque_qemu_args_requires_environment_reference(self):
        for key in ("args", "ARGS"):
            with self.subTest(key=key):
                args = pve_vm.build_parser().parse_args(
                    [
                        "create",
                        "--node",
                        "node-a",
                        "--vmid",
                        "100",
                        "--param",
                        f"{key}=-object secret,id=leak",
                    ]
                )
                with self.assertRaisesRegex(pve_vm.PVEError, "secret-param-env"):
                    pve_vm.run(args)

    def test_opaque_secret_plan_hides_environment_name(self):
        args = pve_vm.build_parser().parse_args(
            [
                "create",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--secret-param-env",
                "args=PRIVATE_QEMU_ARGS",
            ]
        )
        result = pve_vm.run(args)
        self.assertEqual(result["parameters"]["args"], "<redacted>")
        self.assertNotIn("PRIVATE_QEMU_ARGS", json.dumps(result))

    def test_ticket_login_and_csrf_header(self):
        opener = FakeOpen(
            [
                {"ticket": "private-ticket", "CSRFPreventionToken": "private-csrf"},
                VALID_UPID,
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root",
            password="private-password",
            urlopen=opener,
        )
        client.request("POST", "/nodes/node-a/qemu/100/status/start")
        login_request, action_request = opener.requests
        login_body = urllib.parse.parse_qs(login_request.data.decode("utf-8"))
        self.assertEqual(login_body["username"], ["root@pam"])
        self.assertEqual(login_body["password"], ["private-password"])
        self.assertEqual(action_request.get_header("Cookie"), "PVEAuthCookie=private-ticket")
        self.assertEqual(
            action_request.get_header("Csrfpreventiontoken"), "private-csrf"
        )

    def test_ticket_login_rejects_empty_authentication_material(self):
        for ticket, csrf in (("", "csrf"), ("ticket", ""), (" ", "csrf")):
            with self.subTest(ticket=ticket, csrf=csrf):
                client = pve_vm.PVEClient(
                    "https://pve.example.test:8006",
                    username="root",
                    password="private-password",
                    urlopen=FakeOpen(
                        [{"ticket": ticket, "CSRFPreventionToken": csrf}]
                    ),
                )
                with self.assertRaisesRegex(pve_vm.PVEError, "ticket or CSRF"):
                    client.request("GET", "/version")

    def test_api_token_header_takes_precedence(self):
        opener = FakeOpen([{"version": "9.0"}])
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root",
            password="unused-password",
            token_id="root@pam!automation",
            token_secret="private-token",
            urlopen=opener,
        )
        client.request("GET", "/version")
        self.assertEqual(len(opener.requests), 1)
        self.assertEqual(
            opener.requests[0].get_header("Authorization"),
            "PVEAPIToken=root@pam!automation=private-token",
        )

    def test_version_command_authenticates(self):
        opener = FakeOpen(
            [
                {"ticket": "ticket", "CSRFPreventionToken": "csrf"},
                {"version": "9.0"},
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root@pam",
            password="password",
            urlopen=opener,
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            result = pve_vm.run(pve_vm.build_parser().parse_args(["version"]))
        self.assertEqual(result, {"version": "9.0"})
        self.assertEqual(len(opener.requests), 2)

    def test_api_token_rejects_header_injection(self):
        with self.assertRaises(pve_vm.PVEError):
            pve_vm.PVEClient(
                "https://pve.example.test:8006",
                token_id="root@pam!automation\nInjected",
                token_secret="private-token",
            )
        with self.assertRaises(pve_vm.PVEError):
            pve_vm.PVEClient(
                "https://pve.example.test:8006",
                token_id="root@pam!automation",
                token_secret="private-token\r\nInjected",
            )

    def test_list_filters_non_qemu_resources(self):
        opener = FakeOpen(
            [
                {"ticket": "t", "CSRFPreventionToken": "c"},
                [
                    {"type": "qemu", "vmid": 100},
                    {"type": "lxc", "vmid": 101},
                    {"type": "node", "node": "node-a"},
                ],
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root@pam",
            password="password",
            urlopen=opener,
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            args = pve_vm.build_parser().parse_args(["list"])
            result = pve_vm.run(args)
        self.assertEqual(result, [{"type": "qemu", "vmid": 100}])

    def test_list_rejects_malformed_qemu_identity(self):
        opener = FakeOpen(
            [
                {"ticket": "t", "CSRFPreventionToken": "c"},
                [{"type": "qemu", "vmid": "not-a-vmid"}],
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root@pam",
            password="password",
            urlopen=opener,
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            args = pve_vm.build_parser().parse_args(["list"])
            with self.assertRaisesRegex(pve_vm.PVEError, "inventory"):
                pve_vm.run(args)

    def test_vmid_and_inventory_node_require_exact_types(self):
        for malformed_vmid in (True, 100.9):
            with self.subTest(vmid=malformed_vmid):
                with self.assertRaisesRegex(pve_vm.PVEError, "integer"):
                    pve_vm.validate_vmid(malformed_vmid)

        with self.assertRaisesRegex(pve_vm.PVEError, "node"):
            pve_vm.validate_inventory_data(
                [{"type": "qemu", "vmid": 100, "node": 123}]
            )

    def test_version_and_nextid_reject_malformed_data(self):
        version_client = PVEClientFactory([None])
        with patch.object(pve_vm, "client_from_args", return_value=version_client):
            with self.assertRaisesRegex(pve_vm.PVEError, "version"):
                pve_vm.run(pve_vm.build_parser().parse_args(["version"]))

        nextid_client = PVEClientFactory(["not-a-vmid"])
        with patch.object(pve_vm, "client_from_args", return_value=nextid_client):
            with self.assertRaisesRegex(pve_vm.PVEError, "next VMID"):
                pve_vm.run(pve_vm.build_parser().parse_args(["nextid"]))

    def test_get_rejects_malformed_config_and_status(self):
        malformed_config = PVEClientFactory([None, {"status": "running"}])
        args = pve_vm.build_parser().parse_args(
            ["get", "--node", "node-a", "--vmid", "100"]
        )
        with patch.object(pve_vm, "client_from_args", return_value=malformed_config):
            with self.assertRaisesRegex(pve_vm.PVEError, "configuration"):
                pve_vm.run(args)

        malformed_status = PVEClientFactory([{"memory": 1024}, {}])
        with patch.object(pve_vm, "client_from_args", return_value=malformed_status):
            with self.assertRaisesRegex(pve_vm.PVEError, "status"):
                pve_vm.run(args)

        unknown_status = PVEClientFactory([{"memory": 1024}, {"status": "mystery"}])
        with patch.object(pve_vm, "client_from_args", return_value=unknown_status):
            with self.assertRaisesRegex(pve_vm.PVEError, "unknown status"):
                pve_vm.run(args)

    def test_get_output_redacts_opaque_qemu_args(self):
        client = PVEClientFactory(
            [
                {"args": "-object secret,id=private-material", "memory": 1024},
                {"status": "stopped"},
            ]
        )
        args = pve_vm.build_parser().parse_args(
            ["get", "--node", "node-a", "--vmid", "100"]
        )
        output = io.StringIO()
        with patch.object(pve_vm, "client_from_args", return_value=client):
            with redirect_stdout(output):
                pve_vm.emit(pve_vm.run(args))
        self.assertNotIn("private-material", output.getvalue())
        self.assertIn('"args": "<redacted>"', output.getvalue())

    def test_mutation_plan_does_not_build_client_or_read_secret(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(
            pve_vm, "client_from_args", side_effect=AssertionError("network client constructed")
        ):
            args = pve_vm.build_parser().parse_args(
                [
                    "create",
                    "--node",
                    "node-a",
                    "--vmid",
                    "100",
                    "--param",
                    "name=example",
                    "--secret-param-env",
                    "cipassword=PVE_CI_PASSWORD",
                ]
            )
            result = pve_vm.run(args)
        self.assertEqual(result["status"], "plan-only")
        self.assertFalse(result["network_request_made"])
        self.assertEqual(result["parameters"]["cipassword"], "<redacted>")

    def test_mutation_plan_includes_connection_and_timeout_boundaries(self):
        args = pve_vm.build_parser().parse_args(
            [
                "--endpoint",
                "pve.example.test:8006",
                "--request-timeout",
                "15",
                "delete",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--task-timeout",
                "120",
                "--poll-interval",
                "5",
            ]
        )
        result = pve_vm.run(args)
        self.assertEqual(
            result["endpoint"],
            "https://pve.example.test:8006/api2/json",
        )
        self.assertEqual(result["connection_source"], "cli")
        self.assertEqual(
            result["timeouts"],
            {
                "request_seconds": 15.0,
                "task_seconds": 120.0,
                "poll_interval_seconds": 5.0,
            },
        )

    def test_delete_plan_has_narrow_defaults(self):
        args = pve_vm.build_parser().parse_args(
            ["delete", "--node", "node-a", "--vmid", "100"]
        )
        result = pve_vm.run(args)
        self.assertEqual(
            result["parameters"],
            {"destroy-unreferenced-disks": "0", "purge": "0"},
        )
        self.assertFalse(result["network_request_made"])
        self.assertTrue(result["wait_for_task"])

    def test_delete_execute_sends_narrow_defaults(self):
        opener = FakeOpen(
            [
                DESTROY_UPID,
                {"status": "stopped", "exitstatus": "OK"},
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="token-uuid",
            urlopen=opener,
        )
        args = pve_vm.build_parser().parse_args(
            ["delete", "--node", "node-a", "--vmid", "100", "--execute"]
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            result = pve_vm.run(args)
        body = urllib.parse.parse_qs(opener.requests[0].data.decode("utf-8"))
        self.assertEqual(body["purge"], ["0"])
        self.assertEqual(body["destroy-unreferenced-disks"], ["0"])
        self.assertEqual(result["status"], "executed")
        self.assertTrue(result["task_waited"])
        self.assertEqual(result["task"]["exitstatus"], "OK")

    def test_execute_redacts_secret_parameter_from_api_error(self):
        failure = urllib.error.HTTPError(
            "https://pve.example.test/api2/json/nodes/node-a/qemu",
            400,
            "Bad Request",
            {},
            io.BytesIO(json.dumps({"message": "invalid secret-value"}).encode("utf-8")),
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="token-uuid",
            urlopen=FakeOpen([failure]),
        )
        args = pve_vm.build_parser().parse_args(
            [
                "create",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--secret-param-env",
                "cipassword=CI_SECRET",
                "--execute",
            ]
        )
        with patch.dict(os.environ, {"CI_SECRET": "secret-value"}, clear=True), patch.object(
            pve_vm, "client_from_args", return_value=client
        ):
            with self.assertRaises(pve_vm.PVEError) as caught:
                pve_vm.run(args)
        self.assertNotIn("secret-value", str(caught.exception))
        self.assertIn("<redacted>", str(caught.exception))

    def test_api_error_redacts_opaque_qemu_args(self):
        failure = urllib.error.HTTPError(
            "https://pve.example.test/api2/json/nodes/node-a/qemu/100/config",
            400,
            "Bad Request",
            {},
            io.BytesIO(
                json.dumps(
                    {"errors": {"args": "-object secret,id=private-material"}}
                ).encode("utf-8")
            ),
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="token-uuid",
            urlopen=FakeOpen([failure]),
        )
        with self.assertRaises(pve_vm.PVEError) as caught:
            client.request("POST", "/nodes/node-a/qemu/100/config")
        self.assertNotIn("private-material", str(caught.exception))
        self.assertIn("<redacted>", str(caught.exception))

    def test_mutation_transport_failure_preserves_reconciliation_context(self):
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="token-uuid",
            urlopen=FakeOpen([urllib.error.URLError("connection lost")]),
        )
        args = pve_vm.build_parser().parse_args(
            ["delete", "--node", "node-a", "--vmid", "100", "--execute"]
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            with self.assertRaises(pve_vm.PVEError) as caught:
                pve_vm.run(args)
        message = str(caught.exception)
        self.assertIn("unresolved", message)
        self.assertIn("operation=delete", message)
        self.assertIn("node=node-a", message)
        self.assertIn("vmid=100", message)

    def test_mutation_read_and_os_failures_preserve_reconciliation_context(self):
        failures = (
            FailingReadResponse(http.client.IncompleteRead(b"partial", 10)),
            OSError("socket reset"),
            urllib.error.HTTPError(
                "https://pve.example.test/api2/json/nodes/node-a/qemu/100",
                500,
                "Internal Server Error",
                {},
                FailingReadResponse(OSError("error response read reset")),
            ),
        )
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                client = pve_vm.PVEClient(
                    "https://pve.example.test:8006",
                    token_id="user@pam!test",
                    token_secret="token-uuid",
                    urlopen=(
                        (lambda request, **kwargs: failure)
                        if isinstance(failure, FailingReadResponse)
                        else FakeOpen([failure])
                    ),
                )
                args = pve_vm.build_parser().parse_args(
                    ["delete", "--node", "node-a", "--vmid", "100", "--execute"]
                )
                with patch.object(pve_vm, "client_from_args", return_value=client):
                    with self.assertRaises(pve_vm.PVEError) as caught:
                        pve_vm.run(args)
                message = str(caught.exception)
                self.assertIn("unresolved", message)
                self.assertIn("operation=delete", message)
                self.assertIn("node=node-a", message)
                self.assertIn("vmid=100", message)

    def test_target_fields_cannot_be_overridden_by_parameters(self):
        args = pve_vm.build_parser().parse_args(
            [
                "create",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--param",
                "vmid=200",
            ]
        )
        with self.assertRaisesRegex(pve_vm.PVEError, "dedicated CLI options"):
            pve_vm.run(args)

    def test_update_rejects_background_delay_that_can_suppress_upid(self):
        args = pve_vm.build_parser().parse_args(
            [
                "update",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--param",
                "background_delay=5",
            ]
        )
        with self.assertRaisesRegex(pve_vm.PVEError, "background_delay"):
            pve_vm.run(args)

    def test_timeouts_must_be_finite(self):
        with self.assertRaisesRegex(pve_vm.PVEError, "finite"):
            pve_vm.PVEClient(
                "https://pve.example.test:8006",
                token_id="user@pam!test",
                token_secret="token-uuid",
                timeout=float("nan"),
            )

        args = pve_vm.build_parser().parse_args(
            [
                "delete",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--task-timeout",
                "nan",
            ]
        )
        with self.assertRaisesRegex(pve_vm.PVEError, "finite"):
            pve_vm.run(args)

    def test_timeouts_must_stay_within_safe_upper_bounds(self):
        with self.assertRaisesRegex(pve_vm.PVEError, "at most"):
            pve_vm.PVEClient(
                "https://pve.example.test:8006",
                token_id="user@pam!test",
                token_secret="token-uuid",
                timeout=1e308,
            )

        for option in ("--task-timeout", "--poll-interval"):
            with self.subTest(option=option):
                args = pve_vm.build_parser().parse_args(
                    [
                        "delete",
                        "--node",
                        "node-a",
                        "--vmid",
                        "100",
                        option,
                        "1e308",
                    ]
                )
                with self.assertRaisesRegex(pve_vm.PVEError, "at most"):
                    pve_vm.run(args)

        for option in ("--task-timeout", "--poll-interval"):
            with self.subTest(command="task-read", option=option):
                args = pve_vm.build_parser().parse_args(
                    ["task", "--upid", VALID_UPID, option, "1e308"]
                )
                with self.assertRaisesRegex(pve_vm.PVEError, "at most"):
                    pve_vm.run(args)

    def test_task_wait_success(self):
        opener = FakeOpen([{"status": "running"}, {"status": "stopped", "exitstatus": "OK"}])
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="secret",
            urlopen=opener,
        )
        upid = VALID_UPID
        with patch.object(pve_vm.time, "sleep"):
            result = client.wait_task(upid, timeout=1, interval=0.01)
        self.assertEqual(result["exitstatus"], "OK")

    def test_task_wait_failure_and_timeout_are_unresolved(self):
        upid = VALID_UPID
        failed = PVEClientFactory([{"status": "stopped", "exitstatus": "ERROR"}])
        with self.assertRaises(pve_vm.PVEError) as caught:
            failed.wait_task(upid, timeout=1, interval=0.01)
        self.assertIn("unresolved", str(caught.exception))
        self.assertIn(upid, str(caught.exception))
        self.assertIn("exitstatus", str(caught.exception))

        waiting = PVEClientFactory([{"status": "running"}])
        with patch.object(pve_vm.time, "monotonic", side_effect=[0, 2]):
            with self.assertRaisesRegex(pve_vm.PVEError, "unresolved"):
                waiting.wait_task(upid, timeout=1, interval=0.01)

    def test_task_wait_rejects_unknown_status_immediately(self):
        upid = VALID_UPID
        for status in ("mystery", {}, []):
            with self.subTest(status=status):
                client = PVEClientFactory([{"status": status}])
                with self.assertRaises(pve_vm.PVEError) as caught:
                    client.wait_task(upid, timeout=1, interval=0.01)
                self.assertIn("unknown task status", str(caught.exception))
                self.assertIn("unresolved", str(caught.exception))
                self.assertIn(upid, str(caught.exception))

    def test_task_wait_redacts_known_secret_from_failure(self):
        upid = VALID_UPID
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="private-token",
            urlopen=FakeOpen(
                [{"status": "stopped", "exitstatus": "failed private-token"}]
            ),
        )
        with self.assertRaises(pve_vm.PVEError) as caught:
            client.wait_task(upid, timeout=1, interval=0.01)
        message = str(caught.exception)
        self.assertNotIn("private-token", message)
        self.assertIn("<redacted>", message)

    def test_waited_mutation_failure_preserves_operation_and_target(self):
        upid = DESTROY_UPID
        client = PVEClientFactory(
            [upid, {"status": "stopped", "exitstatus": "ERROR"}]
        )
        args = pve_vm.build_parser().parse_args(
            [
                "delete",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--execute",
                "--wait",
            ]
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            with self.assertRaises(pve_vm.PVEError) as caught:
                pve_vm.run(args)
        message = str(caught.exception)
        self.assertIn("unresolved", message)
        self.assertIn("operation=delete", message)
        self.assertIn("node=node-a", message)
        self.assertIn("vmid=100", message)
        self.assertIn(upid, message)

    def test_task_read_rejects_stopped_state_without_exitstatus(self):
        upid = VALID_UPID
        client = PVEClientFactory([{"status": "stopped"}])
        args = pve_vm.build_parser().parse_args(["task", "--upid", upid])
        with patch.object(pve_vm, "client_from_args", return_value=client):
            with self.assertRaisesRegex(pve_vm.PVEError, "exitstatus"):
                pve_vm.run(args)

    def test_task_read_rejects_empty_exitstatus(self):
        upid = VALID_UPID
        client = PVEClientFactory([{"status": "stopped", "exitstatus": ""}])
        args = pve_vm.build_parser().parse_args(["task", "--upid", upid])
        with patch.object(pve_vm, "client_from_args", return_value=client):
            with self.assertRaisesRegex(pve_vm.PVEError, "exitstatus"):
                pve_vm.run(args)

    def test_task_read_rejects_non_string_status(self):
        upid = VALID_UPID
        for status in ({}, []):
            with self.subTest(status=status):
                client = PVEClientFactory([{"status": status}])
                args = pve_vm.build_parser().parse_args(["task", "--upid", upid])
                with patch.object(pve_vm, "client_from_args", return_value=client):
                    with self.assertRaisesRegex(pve_vm.PVEError, "task status"):
                        pve_vm.run(args)

    def test_task_read_redacts_known_secret_from_result(self):
        upid = VALID_UPID
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            token_id="user@pam!test",
            token_secret="private-token",
            urlopen=FakeOpen(
                [{"status": "stopped", "exitstatus": "failed private-token"}]
            ),
        )
        args = pve_vm.build_parser().parse_args(["task", "--upid", upid])
        with patch.object(pve_vm, "client_from_args", return_value=client):
            result = pve_vm.run(args)
        self.assertEqual(result["exitstatus"], "failed <redacted>")

    def test_mutation_rejects_malformed_upid(self):
        client = PVEClientFactory(["UPID:"])
        args = pve_vm.build_parser().parse_args(
            ["delete", "--node", "node-a", "--vmid", "100", "--execute"]
        )
        with patch.object(pve_vm, "client_from_args", return_value=client):
            with self.assertRaisesRegex(pve_vm.PVEError, "valid UPID"):
                pve_vm.run(args)

    def test_profile_endpoint_rejects_ambient_api_token(self):
        with patch.dict(
            os.environ,
            {
                "ENV_PROFILE_ADDRESS": "https://profile-pve.example.test:8006",
                "ENV_PROFILE_USERNAME": "root@pam",
                "ENV_PROFILE_PASSWORD": "password",
                "PVE_API_TOKEN_ID": "other@pam!token",
                "PVE_API_TOKEN_SECRET": "token-uuid",
            },
            clear=True,
        ):
            args = pve_vm.build_parser().parse_args(["version"])
            with self.assertRaisesRegex(pve_vm.PVEError, "profile endpoint"):
                pve_vm.client_from_args(args)

    def test_pve_address_api_token_mode_ignores_profile_credentials(self):
        with patch.dict(
            os.environ,
            {
                "PVE_ADDRESS": "https://token-pve.example.test:8006",
                "PVE_API_TOKEN_ID": "automation@pam!test",
                "PVE_API_TOKEN_SECRET": "token-uuid",
                "ENV_PROFILE_USERNAME": "unrelated@pam",
                "ENV_PROFILE_PASSWORD": "unrelated-password",
            },
            clear=True,
        ):
            args = pve_vm.build_parser().parse_args(["version"])
            client = pve_vm.client_from_args(args)
        self.assertEqual(
            client.base_url,
            "https://token-pve.example.test:8006/api2/json",
        )
        self.assertTrue(client.uses_token)
        self.assertIsNone(client.username)
        self.assertIsNone(client.password)

    def test_ticket_auth_retries_once_after_401(self):
        unauthorized = urllib.error.HTTPError(
            "https://pve.example.test/api2/json/version", 401, "Unauthorized", {}, io.BytesIO(b"{}")
        )
        opener = FakeOpen(
            [
                {"ticket": "old-ticket", "CSRFPreventionToken": "old-csrf"},
                unauthorized,
                {"ticket": "new-ticket", "CSRFPreventionToken": "new-csrf"},
                {"version": "9.0"},
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root",
            password="password",
            urlopen=opener,
        )
        self.assertEqual(client.request("GET", "/version"), {"version": "9.0"})
        self.assertEqual(len(opener.requests), 4)

    def test_ticket_auth_does_not_retry_a_valid_null_result(self):
        opener = FakeOpen(
            [
                {"ticket": "ticket", "CSRFPreventionToken": "csrf"},
                None,
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root",
            password="password",
            urlopen=opener,
        )
        self.assertIsNone(client.request("GET", "/some/null/result"))
        self.assertEqual(len(opener.requests), 2)

    def test_ticket_auth_retries_no_more_than_once(self):
        first = urllib.error.HTTPError(
            "https://pve.example.test/api2/json/version", 401, "Unauthorized", {}, io.BytesIO(b"{}")
        )
        second = urllib.error.HTTPError(
            "https://pve.example.test/api2/json/version", 401, "Unauthorized", {}, io.BytesIO(b"{}")
        )
        opener = FakeOpen(
            [
                {"ticket": "old-ticket", "CSRFPreventionToken": "old-csrf"},
                first,
                {"ticket": "new-ticket", "CSRFPreventionToken": "new-csrf"},
                second,
            ]
        )
        client = pve_vm.PVEClient(
            "https://pve.example.test:8006",
            username="root",
            password="password",
            urlopen=opener,
        )
        with self.assertRaisesRegex(pve_vm.PVEError, "HTTP 401"):
            client.request("GET", "/version")
        self.assertEqual(len(opener.requests), 4)

    def test_redaction_hides_nested_secret_values(self):
        payload = {
            "password": "value",
            "message": "failed for secret-value",
            "nested": [{"token": "abc"}],
        }
        self.assertEqual(
            pve_vm.redact(payload, ["secret-value"]),
            {
                "password": "<redacted>",
                "message": "failed for <redacted>",
                "nested": [{"token": "<redacted>"}],
            },
        )

    def test_cli_output_does_not_echo_secret_parameter(self):
        output = io.StringIO()
        args = pve_vm.build_parser().parse_args(
            [
                "create",
                "--node",
                "node-a",
                "--vmid",
                "100",
                "--secret-param-env",
                "cipassword=PRIVATE_VALUE",
            ]
        )
        with redirect_stdout(output):
            pve_vm.emit(pve_vm.run(args))
        self.assertNotIn("PRIVATE_VALUE", output.getvalue())


def PVEClientFactory(responses):
    return pve_vm.PVEClient(
        "https://pve.example.test:8006",
        token_id="user@pam!test",
        token_secret="secret",
        urlopen=FakeOpen(responses),
    )


if __name__ == "__main__":
    unittest.main()
