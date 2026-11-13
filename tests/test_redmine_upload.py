#!/usr/bin/env python3
"""Unit tests for the Redmine client upload strategy.

Some Redmine instances reject multipart/form-data uploads with HTTP 406 and
only accept a raw octet-stream body. These tests pin the strategy order and
the request shape without touching the network.
"""

import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path

try:
    import requests
except ImportError:  # The suite runs on a bare python3; the client only needs these names.
    requests = types.ModuleType("requests")

    class _RequestException(Exception):
        pass

    class _HTTPError(_RequestException):
        def __init__(self, message="", response=None):
            super().__init__(message)
            self.response = response

    class _Session:
        def __init__(self):
            self.headers = {}

        def close(self):
            pass

    requests.Session = _Session
    requests.exceptions = types.SimpleNamespace(
        RequestException=_RequestException, HTTPError=_HTTPError
    )
    sys.modules["requests"] = requests

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "skills" / "third-party" / "redmine" / "scripts" / "redmine_client.py"

spec = importlib.util.spec_from_file_location("redmine_client_under_test", CLIENT)
redmine_client = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = redmine_client
spec.loader.exec_module(redmine_client)


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            error = requests.exceptions.HTTPError(f"HTTP {self.status_code}")
            error.response = self
            raise error


class FakeSession:
    def __init__(self, responses):
        self.headers = {}
        self._responses = list(responses)
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self._responses.pop(0)


class UploadFileTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "probe.txt"
        self.path.write_bytes(b"hello")
        self.client = redmine_client.RedmineClient(
            base_url="https://example.test/redmine", api_key="test-key"
        )

    def test_session_does_not_force_content_type(self):
        self.assertNotIn("Content-Type", self.client.session.headers)

    def test_uses_raw_octet_stream_upload_first(self):
        session = FakeSession([FakeResponse(201, {"upload": {"token": "tok"}})])
        self.client.session = session

        result = self.client.upload_file(str(self.path), "probe")

        self.assertEqual(result, {"upload": {"token": "tok"}})
        self.assertEqual(len(session.calls), 1)
        url, kwargs = session.calls[0]
        self.assertTrue(url.endswith("/uploads.json"))
        self.assertEqual(kwargs["headers"]["Content-Type"], "application/octet-stream")
        self.assertEqual(kwargs["params"]["filename"], "probe.txt")
        self.assertEqual(kwargs["data"], b"hello")

    def test_falls_back_to_multipart_when_raw_is_rejected(self):
        session = FakeSession([
            FakeResponse(406, text="Not Acceptable"),
            FakeResponse(201, {"upload": {"token": "tok"}}),
        ])
        self.client.session = session

        result = self.client.upload_file(str(self.path))

        self.assertEqual(result, {"upload": {"token": "tok"}})
        self.assertEqual(len(session.calls), 2)
        multipart_kwargs = session.calls[1][1]
        self.assertNotIn("Content-Type", multipart_kwargs["headers"])
        self.assertEqual(multipart_kwargs["files"]["file"][0], "probe.txt")

    def test_reports_both_attempts_on_failure(self):
        session = FakeSession([
            FakeResponse(406, text="raw rejected"),
            FakeResponse(500, text="multipart rejected"),
        ])
        self.client.session = session

        with self.assertRaises(Exception) as ctx:
            self.client.upload_file(str(self.path))

        message = str(ctx.exception)
        self.assertIn("raw", message)
        self.assertIn("multipart", message)


if __name__ == "__main__":
    unittest.main()
