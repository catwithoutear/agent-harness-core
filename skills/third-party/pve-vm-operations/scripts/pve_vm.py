#!/usr/bin/env python3
"""Small, dependency-free Proxmox VE QEMU VM REST client.

Credentials are accepted only through environment variables. Mutating commands
are plan-only unless --execute is supplied.
"""

from __future__ import annotations

import argparse
import http.client
import json
import math
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Mapping


API_SUFFIX = "/api2/json"
VMID_MIN = 100
VMID_MAX = 999_999_999
REQUEST_TIMEOUT_MAX = 3_600.0
TASK_TIMEOUT_MAX = 86_400.0
POLL_INTERVAL_MAX = 300.0
NODE_PATTERN = r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
NODE_RE = re.compile(rf"^{NODE_PATTERN}$")
PARAM_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*$")
SENSITIVE_KEY_RE = re.compile(r"pass(?:word|wd)?|secret|token|ticket|csrf", re.IGNORECASE)
OPAQUE_SECRET_PARAMETER_NAMES = frozenset({"args"})
UPID_RE = re.compile(
    rf"^UPID:(?P<node>{NODE_PATTERN}):"
    r"[0-9A-Fa-f]{8}:[0-9A-Fa-f]{8,9}:[0-9A-Fa-f]{8}:"
    r"[^:\s/]+:[^:\s/]*:[^:\s/]+:$"
)
POWER_ACTIONS = ("start", "shutdown", "stop", "reboot")
VM_STATUSES = frozenset({"running", "stopped"})
TASK_STATUSES = frozenset({"running", "stopped"})
REAUTH_REQUIRED = object()
TOKEN_ID_RE = re.compile(
    r"^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+![A-Za-z0-9._-]+$"
)
TOKEN_SECRET_RE = re.compile(r"^[A-Za-z0-9-]+$")


class PVEError(RuntimeError):
    """Expected client or API failure safe to report to the caller."""


@dataclass(frozen=True)
class SecretParameter:
    key: str
    env_name: str


class RejectRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Fail closed instead of forwarding PVE credentials to a redirect target."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PVEError(f"PVE HTTP redirect refused with status {code}")


def normalize_endpoint(value: str) -> str:
    endpoint = value.strip()
    if not endpoint:
        raise PVEError("PVE endpoint is required")
    if "://" not in endpoint:
        endpoint = f"https://{endpoint}"
    try:
        parsed = urllib.parse.urlsplit(endpoint)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as error:
        raise PVEError(f"invalid PVE endpoint: {error}") from None
    if parsed.scheme.lower() != "https":
        raise PVEError("PVE endpoint must use HTTPS")
    if not hostname or parsed.username or parsed.password:
        raise PVEError("PVE endpoint must contain a host and no embedded credentials")
    if parsed.query or parsed.fragment:
        raise PVEError("PVE endpoint must not contain a query or fragment")
    path = parsed.path.rstrip("/")
    if path not in ("", API_SUFFIX):
        raise PVEError("PVE endpoint path must be empty or /api2/json")
    host = hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = host if port is None else f"{host}:{port}"
    return urllib.parse.urlunsplit(("https", netloc, API_SUFFIX, "", ""))


def normalize_username(value: str) -> str:
    username = value.strip()
    if not username:
        raise PVEError("PVE username is required for ticket authentication")
    return username if "@" in username else f"{username}@pam"


def validate_node(value: Any) -> str:
    if not isinstance(value, str) or not NODE_RE.fullmatch(value):
        raise PVEError(f"invalid PVE node name: {value!r}")
    return value


def validate_vmid(value: Any) -> int:
    if isinstance(value, bool):
        raise PVEError(f"VMID must be an integer: {value!r}")
    if isinstance(value, int):
        vmid = value
    elif isinstance(value, str) and re.fullmatch(r"[0-9]+", value):
        vmid = int(value)
    else:
        raise PVEError(f"VMID must be an integer: {value!r}")
    if not VMID_MIN <= vmid <= VMID_MAX:
        raise PVEError(f"VMID must be between {VMID_MIN} and {VMID_MAX}")
    return vmid


def validate_timeout(value: Any, label: str, maximum: float) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or value <= 0
    ):
        raise PVEError(f"{label} must be a finite positive number")
    normalized = float(value)
    if normalized > maximum:
        raise PVEError(f"{label} must be at most {maximum:g} seconds")
    return normalized


def is_sensitive_key(value: Any) -> bool:
    key = str(value)
    return bool(
        SENSITIVE_KEY_RE.search(key)
        or key.casefold() in OPAQUE_SECRET_PARAMETER_NAMES
    )


def parse_parameter(value: str, *, allow_sensitive: bool = False) -> tuple[str, str]:
    if "=" not in value:
        raise PVEError(f"parameter must use KEY=VALUE syntax: {value!r}")
    key, item_value = value.split("=", 1)
    if not PARAM_RE.fullmatch(key):
        raise PVEError(f"invalid PVE parameter name: {key!r}")
    if not allow_sensitive and is_sensitive_key(key):
        raise PVEError(
            f"sensitive parameter {key!r} must use --secret-param-env KEY=ENV_VAR"
        )
    return key, item_value


def parse_secret_parameter(value: str) -> SecretParameter:
    key, env_name = parse_parameter(value, allow_sensitive=True)
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", env_name):
        raise PVEError(f"invalid environment variable name: {env_name!r}")
    return SecretParameter(key=key, env_name=env_name)


def build_parameters(
    raw_parameters: Iterable[str],
    raw_secret_parameters: Iterable[str],
    *,
    resolve_secrets: bool,
) -> tuple[dict[str, str], list[SecretParameter]]:
    parameters: dict[str, str] = {}
    for raw in raw_parameters:
        key, value = parse_parameter(raw)
        if key in parameters:
            raise PVEError(f"duplicate PVE parameter: {key}")
        parameters[key] = value

    secrets: list[SecretParameter] = []
    for raw in raw_secret_parameters:
        secret = parse_secret_parameter(raw)
        if secret.key in parameters or any(item.key == secret.key for item in secrets):
            raise PVEError(f"duplicate PVE parameter: {secret.key}")
        secrets.append(secret)
        if resolve_secrets:
            value = os.environ.get(secret.env_name)
            if value is None:
                raise PVEError(f"required secret environment variable is unset: {secret.env_name}")
            parameters[secret.key] = value
    return parameters, secrets


def reject_reserved_parameters(
    parameters: Mapping[str, Any],
    secret_parameters: Iterable[SecretParameter],
    reserved: Iterable[str],
) -> None:
    reserved_names = set(reserved)
    conflicts = sorted(
        reserved_names.intersection(parameters)
        | {item.key for item in secret_parameters if item.key in reserved_names}
    )
    if conflicts:
        raise PVEError(
            f"target fields must use dedicated CLI options, not --param: {', '.join(conflicts)}"
        )


def validate_upid(value: Any) -> str:
    if not isinstance(value, str) or not UPID_RE.fullmatch(value):
        raise PVEError("PVE response did not contain a valid UPID")
    return value


def upid_node(upid: str) -> str:
    validated = validate_upid(upid)
    match = UPID_RE.fullmatch(validated)
    if match is None:
        raise PVEError("PVE response did not contain a valid UPID")
    return validate_node(match.group("node"))


def validate_version_data(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or not isinstance(data.get("version"), str):
        raise PVEError("PVE version response data is malformed")
    if not data["version"].strip():
        raise PVEError("PVE version response data is malformed")
    return data


def validate_inventory_data(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        raise PVEError("PVE cluster VM inventory data must be an array")
    qemu_vms: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            raise PVEError("PVE cluster VM inventory contains a malformed record")
        if item.get("type") != "qemu":
            continue
        try:
            vmid = validate_vmid(item.get("vmid"))
        except PVEError as error:
            raise PVEError(f"PVE cluster VM inventory contains an invalid VMID: {error}") from None
        normalized = dict(item)
        normalized["vmid"] = vmid
        node = normalized.get("node")
        if node is not None:
            normalized["node"] = validate_node(node)
        qemu_vms.append(normalized)
    return qemu_vms


def validate_nextid_data(data: Any) -> int:
    try:
        return validate_vmid(data)
    except PVEError as error:
        raise PVEError(f"PVE next VMID response data is malformed: {error}") from None


def validate_vm_config_data(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise PVEError("PVE VM configuration response data must be an object")
    digest = data.get("digest")
    if digest is not None and (not isinstance(digest, str) or not digest.strip()):
        raise PVEError("PVE VM configuration response contains an invalid digest")
    return data


def validate_vm_status_data(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise PVEError("PVE VM status response data must be an object")
    status = data.get("status")
    if not isinstance(status, str) or not status.strip():
        raise PVEError("PVE VM status response data is missing status")
    if status not in VM_STATUSES:
        raise PVEError(f"PVE VM status response contains unknown status={status!r}")
    return data


def redact(value: Any, secret_values: Iterable[str] = ()) -> Any:
    secrets = tuple(item for item in secret_values if item)
    if isinstance(value, Mapping):
        return {
            key: "<redacted>" if is_sensitive_key(key) else redact(item, secrets)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item, secrets) for item in value]
    if isinstance(value, tuple):
        return tuple(redact(item, secrets) for item in value)
    if isinstance(value, str):
        result = value
        for secret in secrets:
            result = result.replace(secret, "<redacted>")
        return result
    return value


def emit(value: Any, *, stream: Any | None = None, secret_values: Iterable[str] = ()) -> None:
    print(
        json.dumps(redact(value, secret_values), indent=2, sort_keys=True),
        file=stream or sys.stdout,
    )


class PVEClient:
    def __init__(
        self,
        endpoint: str,
        *,
        username: str | None = None,
        password: str | None = None,
        token_id: str | None = None,
        token_secret: str | None = None,
        ca_file: str | None = None,
        insecure: bool = False,
        timeout: float = 30.0,
        urlopen: Callable[..., Any] | None = None,
    ) -> None:
        self.base_url = normalize_endpoint(endpoint)
        self.username = normalize_username(username) if username else None
        self.password = password
        self.token_id = token_id.strip() if token_id else None
        self.token_secret = token_secret
        if bool(self.token_id) != bool(self.token_secret):
            raise PVEError("PVE_API_TOKEN_ID and PVE_API_TOKEN_SECRET must be set together")
        if self.token_id and not TOKEN_ID_RE.fullmatch(self.token_id):
            raise PVEError("PVE API token identity must use USER@REALM!TOKENID syntax")
        if self.token_secret and not TOKEN_SECRET_RE.fullmatch(self.token_secret):
            raise PVEError("PVE API token secret contains invalid characters")
        self.insecure = insecure
        self.timeout = validate_timeout(
            timeout, "request timeout", REQUEST_TIMEOUT_MAX
        )
        self.urlopen = urlopen
        self.opener: urllib.request.OpenerDirector | None = None
        self.ticket: str | None = None
        self.csrf: str | None = None
        self.secret_values = [item for item in (password, token_secret) if item]

        try:
            self.ssl_context = ssl.create_default_context(cafile=ca_file)
        except (OSError, ssl.SSLError) as error:
            raise PVEError(f"cannot load TLS trust configuration: {error}") from None
        if insecure:
            self.ssl_context.check_hostname = False
            self.ssl_context.verify_mode = ssl.CERT_NONE
        if self.urlopen is None:
            self.opener = urllib.request.build_opener(
                urllib.request.HTTPSHandler(context=self.ssl_context),
                RejectRedirectHandler(),
            )

    @property
    def uses_token(self) -> bool:
        return bool(self.token_id and self.token_secret)

    def _decode_response(self, response: Any) -> Any:
        raw = response.read()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PVEError("PVE returned a non-JSON response") from error
        if not isinstance(payload, dict) or "data" not in payload:
            raise PVEError("PVE response is missing the top-level data field")
        return payload["data"]

    def _open(self, request: urllib.request.Request) -> Any:
        if self.urlopen is not None:
            return self.urlopen(request, context=self.ssl_context, timeout=self.timeout)
        if self.opener is None:
            raise PVEError("PVE HTTP opener is not initialized")
        return self.opener.open(request, timeout=self.timeout)

    def _login(self) -> None:
        if self.uses_token:
            return
        if not self.username or self.password is None:
            raise PVEError("ticket authentication requires PVE username and password environment variables")
        body = urllib.parse.urlencode(
            {"username": self.username, "password": self.password}
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/access/ticket",
            data=body,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        data = self._perform(request, allow_reauth=False)
        if not isinstance(data, dict):
            raise PVEError("PVE ticket response data must be an object")
        ticket = data.get("ticket")
        csrf = data.get("CSRFPreventionToken")
        if not all(
            isinstance(value, str) and value.strip() for value in (ticket, csrf)
        ):
            raise PVEError("PVE ticket response is missing ticket or CSRF token")
        self.ticket = ticket
        self.csrf = csrf
        self.secret_values.extend((ticket, csrf))

    def _perform(self, request: urllib.request.Request, *, allow_reauth: bool) -> Any:
        try:
            with self._open(request) as response:
                return self._decode_response(response)
        except urllib.error.HTTPError as error:
            if error.code == 401 and allow_reauth and not self.uses_token:
                self.ticket = None
                self.csrf = None
                return REAUTH_REQUIRED
            details: Any = None
            try:
                payload = json.loads(error.read().decode("utf-8"))
                if isinstance(payload, dict):
                    details = payload.get("errors") or payload.get("message")
            except (UnicodeDecodeError, json.JSONDecodeError):
                pass
            except (http.client.IncompleteRead, OSError) as read_error:
                reason = redact(str(read_error), self.secret_values)
                raise PVEError(
                    f"PVE HTTP {error.code} response read failed: {reason}"
                ) from None
            suffix = f": {redact(details, self.secret_values)}" if details else ""
            raise PVEError(f"PVE HTTP {error.code}{suffix}") from None
        except urllib.error.URLError as error:
            reason = redact(str(error.reason), self.secret_values)
            raise PVEError(f"PVE connection failed: {reason}") from None
        except (TimeoutError, ssl.SSLError) as error:
            reason = redact(str(error), self.secret_values)
            raise PVEError(f"PVE TLS or timeout failure: {reason}") from None
        except (http.client.IncompleteRead, OSError) as error:
            reason = redact(str(error), self.secret_values)
            raise PVEError(f"PVE transport or response read failed: {reason}") from None

    def request(
        self,
        method: str,
        path: str,
        parameters: Mapping[str, Any] | None = None,
        *,
        authenticated: bool = True,
        _allow_reauth: bool = True,
    ) -> Any:
        method = method.upper()
        params = dict(parameters or {})
        if authenticated and not self.uses_token and not self.ticket:
            self._login()

        url = f"{self.base_url}{path}"
        body: bytes | None = None
        if method == "GET" and params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        elif params:
            body = urllib.parse.urlencode(params).encode("utf-8")

        headers: dict[str, str] = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        if authenticated:
            if self.uses_token:
                headers["Authorization"] = (
                    f"PVEAPIToken={self.token_id}={self.token_secret}"
                )
            else:
                headers["Cookie"] = f"PVEAuthCookie={self.ticket}"
                if method in {"POST", "PUT", "DELETE"}:
                    headers["CSRFPreventionToken"] = self.csrf or ""

        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        result = self._perform(
            request, allow_reauth=authenticated and _allow_reauth
        )
        if result is REAUTH_REQUIRED and authenticated and not self.uses_token:
            self._login()
            return self.request(
                method,
                path,
                params,
                authenticated=True,
                _allow_reauth=False,
            )
        return result

    def wait_task(self, upid: str, *, timeout: float, interval: float) -> dict[str, Any]:
        timeout = validate_timeout(timeout, "task timeout", TASK_TIMEOUT_MAX)
        interval = validate_timeout(interval, "poll interval", POLL_INTERVAL_MAX)
        node = upid_node(upid)
        quoted_upid = urllib.parse.quote(upid, safe="")
        deadline = time.monotonic() + timeout
        while True:
            try:
                data = self.request("GET", f"/nodes/{node}/tasks/{quoted_upid}/status")
            except PVEError as error:
                raise PVEError(
                    f"PVE task status is unavailable; result unresolved; UPID={upid}; cause={error}"
                ) from None
            if not isinstance(data, dict):
                raise PVEError(
                    f"PVE task status data is malformed; result unresolved; UPID={upid}"
                )
            status = data.get("status")
            if not isinstance(status, str) or status not in TASK_STATUSES:
                safe_status = redact(status, self.secret_values)
                raise PVEError(
                    f"PVE returned unknown task status={safe_status!r}; "
                    f"result unresolved; UPID={upid}"
                )
            if status == "stopped":
                exitstatus = data.get("exitstatus")
                if exitstatus != "OK":
                    safe_exitstatus = redact(exitstatus, self.secret_values)
                    raise PVEError(
                        f"PVE task failed; result unresolved; UPID={upid}; "
                        f"exitstatus={safe_exitstatus!r}"
                    )
                return redact(data, self.secret_values)
            if time.monotonic() >= deadline:
                raise PVEError(f"PVE task wait timed out; result unresolved; UPID={upid}")
            time.sleep(interval)


def client_from_args(args: argparse.Namespace) -> PVEClient:
    token_id = os.environ.get("PVE_API_TOKEN_ID")
    token_secret = os.environ.get("PVE_API_TOKEN_SECRET")
    profile_address = os.environ.get("ENV_PROFILE_ADDRESS")
    if args.endpoint is None and profile_address:
        if token_id or token_secret:
            raise PVEError(
                "PVE API token variables cannot be combined with an environment-profile endpoint"
            )
        endpoint = profile_address
        username = os.environ.get("ENV_PROFILE_USERNAME")
        password = os.environ.get("ENV_PROFILE_PASSWORD")
        token_id = None
        token_secret = None
    else:
        endpoint = args.endpoint or os.environ.get("PVE_ADDRESS") or ""
        username = os.environ.get("PVE_USERNAME")
        password = os.environ.get("PVE_PASSWORD")
    ca_file = args.ca_file or os.environ.get("PVE_CA_FILE")
    return PVEClient(
        endpoint,
        username=username,
        password=password,
        token_id=token_id,
        token_secret=token_secret,
        ca_file=ca_file,
        insecure=args.insecure,
        timeout=args.request_timeout,
    )


def connection_metadata_from_args(
    args: argparse.Namespace, *, normalized_endpoint: str | None = None
) -> dict[str, str]:
    profile_address = os.environ.get("ENV_PROFILE_ADDRESS")
    pve_address = os.environ.get("PVE_ADDRESS")
    if args.endpoint is not None:
        source = "cli"
        raw_endpoint = args.endpoint
    elif profile_address:
        source = "environment-profile"
        raw_endpoint = profile_address
    elif pve_address:
        source = "pve-environment"
        raw_endpoint = pve_address
    else:
        source = "unconfigured"
        raw_endpoint = ""
    endpoint = normalized_endpoint or (
        normalize_endpoint(raw_endpoint) if raw_endpoint else "<unset>"
    )
    return {"endpoint": endpoint, "connection_source": source}


def mutation_timeout_metadata(args: argparse.Namespace) -> dict[str, float]:
    return {
        "request_seconds": validate_timeout(
            args.request_timeout, "request timeout", REQUEST_TIMEOUT_MAX
        ),
        "task_seconds": validate_timeout(
            args.task_timeout, "task timeout", TASK_TIMEOUT_MAX
        ),
        "poll_interval_seconds": validate_timeout(
            args.poll_interval, "poll interval", POLL_INTERVAL_MAX
        ),
    }


def mutation_plan(
    *,
    operation: str,
    method: str,
    path: str,
    node: str,
    vmid: int,
    parameters: Mapping[str, Any],
    secret_parameters: Iterable[SecretParameter],
    connection: Mapping[str, str],
    timeouts: Mapping[str, float],
) -> dict[str, Any]:
    fields = dict(parameters)
    for item in secret_parameters:
        fields[item.key] = "<redacted>"
    return {
        "status": "plan-only",
        "network_request_made": False,
        "operation": operation,
        "method": method,
        "path": path,
        "node": node,
        "vmid": vmid,
        **connection,
        "timeouts": dict(timeouts),
        "parameters": redact(fields),
        "wait_for_task": True,
        "execute_hint": "repeat the reviewed command with --execute after explicit confirmation",
    }


def execute_mutation(
    args: argparse.Namespace,
    *,
    operation: str,
    method: str,
    path: str,
    node: str,
    vmid: int,
    parameters: dict[str, Any],
    secret_parameters: list[SecretParameter],
) -> dict[str, Any]:
    timeouts = mutation_timeout_metadata(args)
    connection = connection_metadata_from_args(args)
    if not args.execute:
        return mutation_plan(
            operation=operation,
            method=method,
            path=path,
            node=node,
            vmid=vmid,
            parameters=parameters,
            secret_parameters=secret_parameters,
            connection=connection,
            timeouts=timeouts,
        )

    resolved = dict(parameters)
    secret_values: list[str] = []
    for item in secret_parameters:
        value = os.environ.get(item.env_name)
        if value is None:
            raise PVEError(f"required secret environment variable is unset: {item.env_name}")
        resolved[item.key] = value
        secret_values.append(value)

    client = client_from_args(args)
    connection = connection_metadata_from_args(
        args, normalized_endpoint=client.base_url
    )
    client.secret_values.extend(secret_values)
    try:
        result = client.request(method, path, resolved)
    except PVEError as error:
        raise PVEError(
            f"PVE mutation outcome unresolved; operation={operation}; node={node}; "
            f"vmid={vmid}; reconcile remote state before retry; cause={error}"
        ) from None
    try:
        upid = validate_upid(result)
    except PVEError as error:
        raise PVEError(
            f"PVE mutation did not return a valid UPID; outcome unresolved; "
            f"operation={operation}; node={node}; vmid={vmid}; cause={error}"
        ) from None
    try:
        task = client.wait_task(
            upid, timeout=args.task_timeout, interval=args.poll_interval
        )
    except PVEError as error:
        raise PVEError(
            f"PVE mutation task outcome unresolved; operation={operation}; "
            f"node={node}; vmid={vmid}; UPID={upid}; cause={error}"
        ) from None
    output: dict[str, Any] = {
        "status": "executed",
        "operation": operation,
        "node": node,
        "vmid": vmid,
        **connection,
        "timeouts": timeouts,
        "parameter_names": sorted(resolved),
        "upid": upid,
        "task_waited": True,
        "task": task,
    }
    return redact(output, client.secret_values)


def add_connection_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--endpoint", help="PVE HTTPS endpoint; otherwise read from environment")
    parser.add_argument("--ca-file", help="private CA bundle for TLS verification")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="disable TLS certificate verification after explicit risk acceptance",
    )
    parser.add_argument("--request-timeout", type=float, default=30.0)


def add_vm_target(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--node", required=True)
    parser.add_argument("--vmid", required=True)


def add_mutation_arguments(parser: argparse.ArgumentParser, *, parameters: bool = False) -> None:
    parser.add_argument("--execute", action="store_true")
    parser.add_argument(
        "--wait",
        action="store_true",
        help="accepted for compatibility; executed mutations always wait for task success",
    )
    parser.add_argument("--task-timeout", type=float, default=300.0)
    parser.add_argument("--poll-interval", type=float, default=2.0)
    if parameters:
        parser.add_argument("--param", action="append", default=[], metavar="KEY=VALUE")
        parser.add_argument(
            "--secret-param-env", action="append", default=[], metavar="KEY=ENV_VAR"
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    add_connection_arguments(parser)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("version", help="read the authenticated PVE version")
    subparsers.add_parser("list", help="list QEMU VMs across the cluster")
    subparsers.add_parser("nextid", help="read the next free VMID")

    get_parser = subparsers.add_parser("get", help="read VM configuration and status")
    add_vm_target(get_parser)

    task_parser = subparsers.add_parser("task", help="read or wait for a PVE task")
    task_parser.add_argument("--upid", required=True)
    task_parser.add_argument("--wait", action="store_true")
    task_parser.add_argument("--task-timeout", type=float, default=300.0)
    task_parser.add_argument("--poll-interval", type=float, default=2.0)

    create_parser = subparsers.add_parser("create", help="plan or create a QEMU VM")
    add_vm_target(create_parser)
    add_mutation_arguments(create_parser, parameters=True)

    update_parser = subparsers.add_parser("update", help="plan or update a QEMU VM")
    add_vm_target(update_parser)
    add_mutation_arguments(update_parser, parameters=True)

    delete_parser = subparsers.add_parser("delete", help="plan or delete a QEMU VM")
    add_vm_target(delete_parser)
    add_mutation_arguments(delete_parser)
    delete_parser.add_argument("--purge", action="store_true")
    delete_parser.add_argument("--destroy-unreferenced-disks", action="store_true")

    power_parser = subparsers.add_parser("power", help="plan or change VM power state")
    add_vm_target(power_parser)
    add_mutation_arguments(power_parser)
    power_parser.add_argument("--action", required=True, choices=POWER_ACTIONS)
    return parser


def run(args: argparse.Namespace) -> Any:
    if args.insecure:
        print("WARNING: TLS certificate verification is disabled", file=sys.stderr)

    if args.command == "version":
        return validate_version_data(client_from_args(args).request("GET", "/version"))
    if args.command == "list":
        data = client_from_args(args).request("GET", "/cluster/resources", {"type": "vm"})
        return validate_inventory_data(data)
    if args.command == "nextid":
        data = client_from_args(args).request("GET", "/cluster/nextid")
        return {"vmid": validate_nextid_data(data)}
    if args.command == "get":
        node = validate_node(args.node)
        vmid = validate_vmid(args.vmid)
        client = client_from_args(args)
        base = f"/nodes/{node}/qemu/{vmid}"
        config = validate_vm_config_data(client.request("GET", f"{base}/config"))
        status = validate_vm_status_data(client.request("GET", f"{base}/status/current"))
        return {
            "node": node,
            "vmid": vmid,
            "config": config,
            "status": status,
        }
    if args.command == "task":
        task_timeout = validate_timeout(
            args.task_timeout, "task timeout", TASK_TIMEOUT_MAX
        )
        poll_interval = validate_timeout(
            args.poll_interval, "poll interval", POLL_INTERVAL_MAX
        )
        node = upid_node(args.upid)
        client = client_from_args(args)
        if args.wait:
            return client.wait_task(
                args.upid, timeout=task_timeout, interval=poll_interval
            )
        quoted_upid = urllib.parse.quote(args.upid, safe="")
        data = client.request("GET", f"/nodes/{node}/tasks/{quoted_upid}/status")
        status = data.get("status") if isinstance(data, dict) else None
        if not isinstance(status, str) or status not in TASK_STATUSES:
            raise PVEError(f"PVE returned invalid task status for UPID={args.upid}")
        exitstatus = data.get("exitstatus")
        if status == "stopped" and (
            not isinstance(exitstatus, str) or not exitstatus.strip()
        ):
            raise PVEError(f"PVE stopped task status is missing exitstatus for UPID={args.upid}")
        return redact(data, client.secret_values)

    node = validate_node(args.node)
    vmid = validate_vmid(args.vmid)
    if args.command in {"create", "update"}:
        parameters, secret_parameters = build_parameters(
            args.param, args.secret_param_env, resolve_secrets=False
        )
        reject_reserved_parameters(parameters, secret_parameters, {"node", "vmid"})
        if args.command == "update" and (
            "background_delay" in parameters
            or any(item.key == "background_delay" for item in secret_parameters)
        ):
            raise PVEError(
                "background_delay is not supported because it can suppress the required UPID"
            )
        if args.command == "create":
            parameters = {"vmid": str(vmid), **parameters}
            path = f"/nodes/{node}/qemu"
        else:
            path = f"/nodes/{node}/qemu/{vmid}/config"
        return execute_mutation(
            args,
            operation=args.command,
            method="POST",
            path=path,
            node=node,
            vmid=vmid,
            parameters=parameters,
            secret_parameters=secret_parameters,
        )

    if args.command == "delete":
        parameters = {
            "purge": "1" if args.purge else "0",
            "destroy-unreferenced-disks": "1" if args.destroy_unreferenced_disks else "0",
        }
        return execute_mutation(
            args,
            operation="delete",
            method="DELETE",
            path=f"/nodes/{node}/qemu/{vmid}",
            node=node,
            vmid=vmid,
            parameters=parameters,
            secret_parameters=[],
        )

    if args.command == "power":
        return execute_mutation(
            args,
            operation=f"power:{args.action}",
            method="POST",
            path=f"/nodes/{node}/qemu/{vmid}/status/{args.action}",
            node=node,
            vmid=vmid,
            parameters={},
            secret_parameters=[],
        )
    raise PVEError(f"unsupported command: {args.command}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = run(args)
        emit(result)
        return 0
    except PVEError as error:
        emit({"error": str(error)}, stream=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
