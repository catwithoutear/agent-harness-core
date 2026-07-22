#!/usr/bin/env python3
"""Manage local plaintext environment profiles for direct automation handoff."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Sequence


DEFAULT_VAULT_DIR = Path.home() / ".agents" / "private" / "environment-profiles"
STORE_FILE_NAME = "profiles.json"
STORE_SCHEMA_VERSION = 1
PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
ENVIRONMENT_NAME_RE = re.compile(r"^[A-Z_][A-Z0-9_]{0,127}$")
PROFILE_REQUIRED_FIELDS = ("address", "username", "password")
PROFILE_FIELD_NAMES = (*PROFILE_REQUIRED_FIELDS, "ssh_known_hosts")
MAX_SSH_KNOWN_HOSTS_LENGTH = 32_768


class VaultError(RuntimeError):
    """A user-actionable profile-store error that is safe to print."""


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    vault_dir = args.vault_dir.expanduser()
    try:
        if args.command == "init":
            initialize(vault_dir)
        elif args.command == "add":
            add_profile(vault_dir, args.profile)
        elif args.command == "update":
            update_profile(vault_dir, args.profile)
        elif args.command == "upsert-env":
            upsert_profile_from_environment(
                vault_dir,
                args.profile,
                args.address_env,
                args.username_env,
                args.password_env,
            )
        elif args.command == "delete":
            delete_profile(vault_dir, args.profile)
        elif args.command == "set-ssh-known-hosts":
            set_ssh_known_hosts(vault_dir, args.profile)
        elif args.command == "list":
            list_profiles(vault_dir)
        elif args.command == "get":
            get_field(vault_dir, args.profile, args.field)
        elif args.command == "run":
            return run_profile(vault_dir, args.profile, args.child_command)
        else:
            raise AssertionError(f"unsupported command: {args.command}")
    except VaultError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except OSError:
        print("error: profile filesystem operation failed", file=sys.stderr)
        return 1
    return 0


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage local plaintext environment profiles.")
    parser.add_argument("--vault-dir", type=Path, default=DEFAULT_VAULT_DIR, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="Create the local profile store if needed.")
    init.add_argument("--recipient", help=argparse.SUPPRESS)
    add = commands.add_parser("add", help="Interactively add one local profile.")
    add.add_argument("profile", help="Profile identifier.")
    update = commands.add_parser("update", help="Interactively replace one profile's fields.")
    update.add_argument("profile", help="Profile identifier.")
    upsert = commands.add_parser(
        "upsert-env",
        help="Create or replace one profile from named environment variables.",
    )
    upsert.add_argument("profile", help="Profile identifier.")
    upsert.add_argument("--address-env", default="ENV_PROFILE_ADDRESS")
    upsert.add_argument("--username-env", default="ENV_PROFILE_USERNAME")
    upsert.add_argument("--password-env", default="ENV_PROFILE_PASSWORD")
    delete = commands.add_parser("delete", help="Delete one local profile.")
    delete.add_argument("profile", help="Profile identifier.")
    pin = commands.add_parser("set-ssh-known-hosts", help="Interactively replace a profile's SSH known_hosts value.")
    pin.add_argument("profile", help="Profile identifier.")
    commands.add_parser("list", help="List profile identifiers.")
    get = commands.add_parser("get", help="Print one profile field.")
    get.add_argument("profile", help="Profile identifier.")
    get.add_argument("--field", required=True, choices=PROFILE_FIELD_NAMES)
    run = commands.add_parser("run", help="Run one direct child with profile fields in its environment.")
    run.add_argument("profile", help="Profile identifier.")
    run.add_argument("child_command", nargs=argparse.REMAINDER, help="Command after --.")
    return parser.parse_args(argv)


def initialize(vault_dir: Path) -> None:
    ensure_private_directory(vault_dir)
    if store_path_for(vault_dir).exists():
        load_profiles(vault_dir)
        return
    write_profiles(vault_dir, {})


def add_profile(vault_dir: Path, profile_name: str) -> None:
    profile_name = validate_profile_name(profile_name)
    profiles = load_profiles(vault_dir)
    if profile_name in profiles:
        raise VaultError("profile already exists")
    profiles[profile_name] = prompt_profile_values()
    write_profiles(vault_dir, profiles)


def update_profile(vault_dir: Path, profile_name: str) -> None:
    profile_name = validate_profile_name(profile_name)
    profiles = load_profiles(vault_dir)
    profiles[profile_name] = prompt_updated_profile_values(required_profile(profiles, profile_name))
    write_profiles(vault_dir, profiles)


def upsert_profile_from_environment(
    vault_dir: Path,
    profile_name: str,
    address_env: str,
    username_env: str,
    password_env: str,
) -> None:
    """Store direct-child values without placing a credential in argv or output."""
    profile_name = validate_profile_name(profile_name)
    environment_names = tuple(
        validate_environment_name(name)
        for name in (address_env, username_env, password_env)
    )
    if len(set(environment_names)) != len(environment_names):
        raise VaultError("profile source environment names must be distinct")
    values = {
        field: required_environment_value(name)
        for field, name in zip(PROFILE_REQUIRED_FIELDS, environment_names, strict=True)
    }
    profiles = load_profiles(vault_dir)
    existing = profiles.get(profile_name)
    if existing is not None and "ssh_known_hosts" in existing:
        values["ssh_known_hosts"] = existing["ssh_known_hosts"]
    profiles[profile_name] = validate_profile_values(values)
    write_profiles(vault_dir, profiles)


def delete_profile(vault_dir: Path, profile_name: str) -> None:
    profile_name = validate_profile_name(profile_name)
    profiles = load_profiles(vault_dir)
    required_profile(profiles, profile_name)
    del profiles[profile_name]
    write_profiles(vault_dir, profiles)


def set_ssh_known_hosts(vault_dir: Path, profile_name: str) -> None:
    profile_name = validate_profile_name(profile_name)
    profiles = load_profiles(vault_dir)
    values = required_profile(profiles, profile_name)
    values["ssh_known_hosts"] = prompt_ssh_known_hosts()
    profiles[profile_name] = values
    write_profiles(vault_dir, profiles)


def list_profiles(vault_dir: Path) -> None:
    for profile_name in sorted(load_profiles(vault_dir)):
        print(profile_name)


def get_field(vault_dir: Path, profile_name: str, field: str) -> None:
    profile_name = validate_profile_name(profile_name)
    values = required_profile(load_profiles(vault_dir), profile_name)
    if field not in values:
        raise VaultError("profile field was not found")
    print(values[field])


def run_profile(vault_dir: Path, profile_name: str, child_command: Sequence[str]) -> int:
    profile_name = validate_profile_name(profile_name)
    command = normalize_child_command(child_command)
    values = required_profile(load_profiles(vault_dir), profile_name)
    child_environment = {
        name: value for name, value in os.environ.items() if not name.startswith("ENV_PROFILE_")
    }
    child_environment.update(
        {
            "ENV_PROFILE_ADDRESS": values["address"],
            "ENV_PROFILE_USERNAME": values["username"],
            "ENV_PROFILE_PASSWORD": values["password"],
        }
    )
    if "ssh_known_hosts" in values:
        child_environment["ENV_PROFILE_SSH_KNOWN_HOSTS"] = values["ssh_known_hosts"]
    try:
        result = subprocess.run(
            command,
            env=child_environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError as error:
        raise VaultError("direct child command could not be started") from error
    print_redacted(result.stdout, values)
    print_redacted(result.stderr, values, stream=sys.stderr)
    return result.returncode


def normalize_child_command(child_command: Sequence[str]) -> list[str]:
    command = list(child_command)
    if command[:1] == ["--"]:
        command = command[1:]
    if not command:
        raise VaultError("run requires one direct executable after --")
    executable = command[0]
    if os.path.sep in executable:
        executable_path = Path(executable)
        if not executable_path.is_file() or not os.access(executable_path, os.X_OK):
            raise VaultError("direct child executable was not found or is not executable")
        command[0] = os.fspath(executable_path)
    else:
        resolved = shutil.which(executable)
        if resolved is None:
            raise VaultError("direct child executable was not found")
        command[0] = resolved
    return command


def print_redacted(text: str, values: dict[str, str], stream: object | None = None) -> None:
    if stream is None:
        stream = sys.stdout
    redacted = text
    for value in sorted(set(values.values()), key=len, reverse=True):
        redacted = redacted.replace(value, "[REDACTED]")
    stream.write(redacted)
    stream.flush()


def store_path_for(vault_dir: Path) -> Path:
    return vault_dir / STORE_FILE_NAME


def load_profiles(vault_dir: Path) -> dict[str, dict[str, str]]:
    ensure_private_directory(vault_dir)
    store_path = store_path_for(vault_dir)
    if not store_path.exists():
        return {}
    if store_path.is_symlink() or not store_path.is_file():
        raise VaultError("plaintext profile store is invalid")
    ensure_private_file(store_path)
    try:
        store = json.loads(store_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise VaultError("plaintext profile store is unreadable") from error
    if not isinstance(store, dict) or store.get("schema_version") != STORE_SCHEMA_VERSION:
        raise VaultError("plaintext profile store has an unsupported format")
    raw_profiles = store.get("profiles")
    if not isinstance(raw_profiles, dict):
        raise VaultError("plaintext profile store has an unsupported format")
    return {
        validate_profile_name(name): validate_profile_values(values)
        for name, values in raw_profiles.items()
    }


def write_profiles(vault_dir: Path, profiles: dict[str, dict[str, str]]) -> None:
    ensure_private_directory(vault_dir)
    store_path = store_path_for(vault_dir)
    if store_path.is_symlink():
        raise VaultError("plaintext profile store is invalid")
    normalized = {
        validate_profile_name(name): validate_profile_values(values)
        for name, values in profiles.items()
    }
    descriptor, temporary_name = tempfile.mkstemp(dir=vault_dir, prefix=".profiles.", suffix=".tmp")
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            descriptor = -1
            json.dump(
                {"schema_version": STORE_SCHEMA_VERSION, "profiles": normalized},
                stream,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, store_path)
        ensure_private_file(store_path)
    finally:
        if descriptor != -1:
            os.close(descriptor)
        temporary_path.unlink(missing_ok=True)


def required_profile(profiles: dict[str, dict[str, str]], profile_name: str) -> dict[str, str]:
    try:
        return dict(profiles[profile_name])
    except KeyError as error:
        raise VaultError("profile was not found") from error


def validate_profile_name(profile_name: object) -> str:
    if not isinstance(profile_name, str) or not PROFILE_NAME_RE.fullmatch(profile_name):
        raise VaultError("profile name must contain only letters, digits, dot, underscore, or hyphen")
    return profile_name


def validate_environment_name(value: object) -> str:
    if not isinstance(value, str) or not ENVIRONMENT_NAME_RE.fullmatch(value):
        raise VaultError("profile source environment name is invalid")
    return value


def required_environment_value(name: str) -> str:
    try:
        return validate_nonempty_text("profile source environment value", os.environ[name])
    except KeyError as error:
        raise VaultError("profile source environment value was not provided") from error


def validate_profile_values(values: object) -> dict[str, str]:
    if not isinstance(values, dict):
        raise VaultError("plaintext profile store has invalid fields")
    allowed = set(PROFILE_REQUIRED_FIELDS) | {"ssh_known_hosts"}
    if set(values) - allowed or not set(PROFILE_REQUIRED_FIELDS) <= set(values):
        raise VaultError("plaintext profile store has invalid fields")
    normalized = {field: validate_nonempty_text(field, values[field]) for field in PROFILE_REQUIRED_FIELDS}
    if "ssh_known_hosts" in values:
        known_hosts = validate_nonempty_text("ssh_known_hosts", values["ssh_known_hosts"])
        if len(known_hosts) > MAX_SSH_KNOWN_HOSTS_LENGTH:
            raise VaultError("ssh_known_hosts is too long")
        normalized["ssh_known_hosts"] = known_hosts
    return normalized


def ensure_private_directory(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.is_symlink() or not directory.is_dir():
        raise VaultError("profile directory is invalid")
    os.chmod(directory, 0o700)


def ensure_private_file(file_path: Path) -> None:
    if file_path.is_symlink() or not file_path.is_file():
        raise VaultError("plaintext profile store is invalid")
    os.chmod(file_path, 0o600)


def prompt_profile_values() -> dict[str, str]:
    require_interactive("add")
    try:
        values = {
            "address": input("Address: ").strip(),
            "username": input("Username: ").strip(),
            "password": getpass.getpass("Password: "),
        }
    except EOFError as error:
        raise VaultError("profile input was not completed") from error
    return validate_profile_values(values)


def prompt_updated_profile_values(current: dict[str, str]) -> dict[str, str]:
    require_interactive("update")
    try:
        address = input("Address [leave empty to keep current]: ").strip()
        username = input("Username [leave empty to keep current]: ").strip()
        password = getpass.getpass("Password [leave empty to keep current]: ")
    except EOFError as error:
        raise VaultError("profile input was not completed") from error
    values = dict(current)
    if address:
        values["address"] = address
    if username:
        values["username"] = username
    if password:
        values["password"] = password
    return validate_profile_values(values)


def prompt_ssh_known_hosts() -> str:
    require_interactive("set-ssh-known-hosts")
    try:
        value = getpass.getpass("SSH known_hosts: ")
    except EOFError as error:
        raise VaultError("SSH known_hosts input was not completed") from error
    value = validate_nonempty_text("ssh_known_hosts", value)
    if len(value) > MAX_SSH_KNOWN_HOSTS_LENGTH:
        raise VaultError("ssh_known_hosts is too long")
    return value


def require_interactive(command: str) -> None:
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise VaultError(f"{command} requires an interactive terminal")


def validate_nonempty_text(field: str, value: object) -> str:
    if not isinstance(value, str) or not value or "\x00" in value:
        raise VaultError(f"{field} must be a non-empty text value")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
