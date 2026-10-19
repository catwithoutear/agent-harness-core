import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(
  ROOT,
  "skills",
  "third-party",
  "environment-profile-vault",
  "scripts",
  "environment-profile-vault.py"
);
const VALUES = {
  address: "https://profile.invalid:9443",
  username: "profile-test-user",
  password: "profile-test-password"
};
const DESCRIPTION = "PVE 实验集群 A；测试环境；管理员；仅用于虚拟机恢复实验";

export async function run(test) {
  await test("init creates a private plaintext profile store without GPG", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      const result = runVault(vaultDir, ["init", "--recipient", "legacy-recipient"]);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
      const storePath = path.join(vaultDir, "profiles.json");
      assert.deepEqual(readJson(storePath), { schema_version: 1, profiles: {} });
      assert.equal(mode(vaultDir), 0o700);
      assert.equal(mode(storePath), 0o600);
    });
  });

  await test("upsert-env stores synthetic values without echoing them and preserves a host pin", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      const pin = "[profile.invalid]:22 ssh-ed25519 test-host-key";
      const first = runVault(vaultDir, ["upsert-env", "staging"], {
        ENV_PROFILE_ADDRESS: VALUES.address,
        ENV_PROFILE_USERNAME: VALUES.username,
        ENV_PROFILE_PASSWORD: VALUES.password,
        ENV_PROFILE_DESCRIPTION: DESCRIPTION
      });
      assert.equal(first.status, 0, first.stderr);
      assert.equal(first.stdout + first.stderr, "");
      assert.equal(mode(vaultDir), 0o700);
      assert.equal(mode(path.join(vaultDir, "profiles.json")), 0o600);
      assert.deepEqual(readJson(path.join(vaultDir, "profiles.json")), {
        schema_version: 1,
        profiles: { staging: { ...VALUES, description: DESCRIPTION } }
      });

      const pinned = readJson(path.join(vaultDir, "profiles.json"));
      pinned.profiles.staging.ssh_known_hosts = pin;
      fs.writeFileSync(path.join(vaultDir, "profiles.json"), `${JSON.stringify(pinned)}\n`, "utf8");
      const second = runVault(
        vaultDir,
        [
          "upsert-env",
          "staging",
          "--address-env",
          "DBACKUP_ENDPOINT",
          "--username-env",
          "DBACKUP_USERNAME",
          "--password-env",
          "DBACKUP_PASSWORD"
        ],
        {
          DBACKUP_ENDPOINT: "https://replacement.invalid:9443",
          DBACKUP_USERNAME: "replacement-user",
          DBACKUP_PASSWORD: "replacement-password"
        }
      );
      assert.equal(second.status, 0, second.stderr);
      assert.equal(second.stdout + second.stderr, "");
      assert.equal(readJson(path.join(vaultDir, "profiles.json")).profiles.staging.ssh_known_hosts, pin);
      assert.equal(readJson(path.join(vaultDir, "profiles.json")).profiles.staging.description, DESCRIPTION);

      const list = runVault(vaultDir, ["list"]);
      assert.equal(list.status, 0, list.stderr);
      assert.equal(list.stdout, `staging\t${DESCRIPTION}\n`);
      const names = runVault(vaultDir, ["list", "--names-only"]);
      assert.equal(names.status, 0, names.stderr);
      assert.equal(names.stdout, "staging\n");
      const password = runVault(vaultDir, ["get", "staging", "--field", "password"]);
      assert.equal(password.status, 0, password.stderr);
      assert.equal(password.stdout, "replacement-password\n");
    });
  });

  await test("run scopes values to one direct child, redacts literals, and preserves its exit code", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      assert.equal(
        runVault(vaultDir, ["upsert-env", "staging"], profileEnvironment()).status,
        0
      );
      const child = path.join(root, "child.mjs");
      fs.writeFileSync(
        child,
        `const required = ${JSON.stringify(VALUES)};\n` +
          "for (const [field, value] of Object.entries(required)) {\n" +
          "  if (process.env[`ENV_PROFILE_${field.toUpperCase()}`] !== value) process.exit(41);\n" +
          "}\n" +
          "if ('ENV_PROFILE_DESCRIPTION' in process.env) process.exit(42);\n" +
          "console.log(required.address, required.username, required.password);\n" +
          "console.error(required.password);\n" +
          "process.exit(7);\n",
        "utf8"
      );
      const result = runVault(vaultDir, ["run", "staging", "--", process.execPath, child], {
        ENV_PROFILE_ADDRESS: "ambient-address",
        ENV_PROFILE_USERNAME: "ambient-user",
        ENV_PROFILE_PASSWORD: "ambient-password",
        ENV_PROFILE_DESCRIPTION: "ambient-description"
      });

      assert.equal(result.status, 7);
      const output = result.stdout + result.stderr;
      for (const value of Object.values(VALUES)) {
        assert(!output.includes(value), `redaction leaked ${value}`);
      }
      assert.match(output, /\[REDACTED\]/);
    });
  });

  await test("list exposes sorted selection metadata only and marks legacy descriptions as missing", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      assert.equal(runVault(vaultDir, ["list", "--json"]).stdout, "[]\n");
      const storePath = path.join(vaultDir, "profiles.json");
      fs.writeFileSync(storePath, JSON.stringify({
        schema_version: 1,
        profiles: {
          zeta: { ...VALUES, description: DESCRIPTION, ssh_known_hosts: "synthetic-host-pin" },
          alpha: VALUES
        }
      }));
      const before = fs.readFileSync(storePath, "utf8");
      const json = runVault(vaultDir, ["list", "--json"]);
      assert.equal(json.status, 0, json.stderr);
      assert.deepEqual(JSON.parse(json.stdout), [
        { name: "alpha", description: null },
        { name: "zeta", description: DESCRIPTION }
      ]);
      const text = runVault(vaultDir, ["list"]);
      assert.equal(text.status, 0, text.stderr);
      assert.equal(text.stdout, `alpha\t[missing description]\nzeta\t${DESCRIPTION}\n`);
      for (const value of [...Object.values(VALUES), "synthetic-host-pin"]) {
        assert(!(json.stdout + text.stdout).includes(value));
      }
      const missing = runVault(vaultDir, ["get", "alpha", "--field", "description"]);
      assert.notEqual(missing.status, 0);
      assert.equal(fs.readFileSync(storePath, "utf8"), before);
      assert.notEqual(runVault(vaultDir, ["list", "--json", "--names-only"]).status, 0);
    });
  });

  await test("set-description annotates a legacy profile without replacing credentials or host pins", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      assert.equal(runVault(vaultDir, ["init"]).status, 0);
      const storePath = path.join(vaultDir, "profiles.json");
      const legacy = { ...VALUES, ssh_known_hosts: "synthetic-host-pin" };
      fs.writeFileSync(storePath, JSON.stringify({ schema_version: 1, profiles: { legacy, other: VALUES } }));
      const result = runVault(vaultDir,
        ["set-description", "legacy", "--description-env", "PROFILE_PURPOSE"],
        { PROFILE_PURPOSE: `  ${DESCRIPTION}  ` }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout + result.stderr, "");
      assert.deepEqual(readJson(storePath).profiles, {
        legacy: { ...legacy, description: DESCRIPTION }, other: VALUES
      });
      assert.equal(mode(storePath), 0o600);
      assert.equal(mode(vaultDir), 0o700);
      const get = runVault(vaultDir, ["get", "legacy", "--field", "description"]);
      assert.equal(get.status, 0, get.stderr);
      assert.equal(get.stdout, `${DESCRIPTION}\n`);
      const before = fs.readFileSync(storePath, "utf8");
      for (const args of [
        ["set-description", "absent", "--description-env", "PROFILE_PURPOSE"],
        ["set-description", "legacy", "--description-env", "bad/name"],
        ["set-description", "legacy", "--description-env", "MISSING"],
        ["set-description", "legacy"]
      ]) {
        const failure = runVault(vaultDir, args, { PROFILE_PURPOSE: DESCRIPTION });
        assert.notEqual(failure.status, 0);
        assert.equal(fs.readFileSync(storePath, "utf8"), before);
      }
    });
  });

  await test("upsert requires a description for unannotated profiles and accepts an alternate description source", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      const environment = profileEnvironment();
      delete environment.ENV_PROFILE_DESCRIPTION;
      const missing = runVault(vaultDir, ["upsert-env", "new"], environment);
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /description/);
      assert.equal(fs.existsSync(path.join(vaultDir, "profiles.json")), false);
      const result = runVault(vaultDir,
        ["upsert-env", "new", "--description-env", "PROFILE_PURPOSE"],
        { ...environment, PROFILE_PURPOSE: DESCRIPTION }
      );
      assert.equal(result.status, 0, result.stderr);
      const replacement = "Reporting API staging; read-only account; metrics queries";
      assert.equal(runVault(vaultDir, ["upsert-env", "new"], {
        ...environment, ENV_PROFILE_DESCRIPTION: replacement
      }).status, 0);
      assert.equal(readJson(path.join(vaultDir, "profiles.json")).profiles.new.description, replacement);
      const storePath = path.join(vaultDir, "profiles.json");
      fs.writeFileSync(storePath, JSON.stringify({ schema_version: 1, profiles: { legacy: VALUES } }));
      const before = fs.readFileSync(storePath, "utf8");
      assert.notEqual(runVault(vaultDir, ["upsert-env", "legacy"], environment).status, 0);
      assert.equal(fs.readFileSync(storePath, "utf8"), before);
    });
  });

  await test("invalid descriptions and overlapping sources fail without changing stored values or echoing input", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      assert.equal(runVault(vaultDir, ["upsert-env", "staging"], profileEnvironment()).status, 0);
      const storePath = path.join(vaultDir, "profiles.json");
      const before = fs.readFileSync(storePath, "utf8");
      for (const description of ["", "   ", "x".repeat(1025), "bad\nline", "bad\tcolumn", "\u001b[31munsafe", "bad\u0085line"]) {
        for (const args of [
          ["upsert-env", "staging"],
          ["set-description", "staging", "--description-env", "ENV_PROFILE_DESCRIPTION"]
        ]) {
          const result = runVault(vaultDir, args, { ...profileEnvironment(), ENV_PROFILE_DESCRIPTION: description });
          assert.notEqual(result.status, 0);
          assert(!result.stderr.includes("Traceback"));
          for (const value of Object.values(VALUES)) assert(!result.stderr.includes(value));
          if (description.trim()) assert(!result.stderr.includes(description));
          assert.equal(fs.readFileSync(storePath, "utf8"), before);
        }
      }
      const duplicate = runVault(vaultDir,
        ["upsert-env", "staging", "--description-env", "ENV_PROFILE_PASSWORD"], profileEnvironment()
      );
      assert.notEqual(duplicate.status, 0);
      assert.equal(fs.readFileSync(storePath, "utf8"), before);
      for (const description of [42, null, "bad\nline"]) {
        fs.writeFileSync(storePath, JSON.stringify({
          schema_version: 1, profiles: { staging: { ...VALUES, description } }
        }));
        const result = runVault(vaultDir, ["list", "--json"]);
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout, "");
        assert(!result.stderr.includes("Traceback"));
      }
    });
  });

  await test("interactive add and update collect descriptions and preserve unchanged profile fields", () => {
    withTempDir((root) => {
      const result = spawnSync("python3", ["-c", `
import importlib.util, sys
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("vault", sys.argv[1])
vault = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vault)
root = Path(sys.argv[2])
with patch.object(sys.stdin, "isatty", return_value=True), patch.object(sys.stderr, "isatty", return_value=True):
    with patch("builtins.input", side_effect=["Lab A; administrator; testing", "https://test.invalid", "user"]), patch("getpass.getpass", return_value="synthetic-password"):
        vault.add_profile(root, "lab")
    original = vault.load_profiles(root)["lab"]
    assert original["description"] == "Lab A; administrator; testing"
    with patch("builtins.input", side_effect=["", "", ""]), patch("getpass.getpass", return_value=""):
        vault.update_profile(root, "lab")
    assert vault.load_profiles(root)["lab"] == original
    with patch("builtins.input", side_effect=["Lab A; read-only; reporting", "", ""]), patch("getpass.getpass", return_value=""):
        vault.update_profile(root, "lab")
    assert vault.load_profiles(root)["lab"] == {**original, "description": "Lab A; read-only; reporting"}
    with patch("builtins.input", return_value="Lab B; operator; testing"):
        vault.set_description(root, "lab", None)
    assert vault.load_profiles(root)["lab"] == {**original, "description": "Lab B; operator; testing"}
    before = vault.store_path_for(root).read_bytes()
    with patch("builtins.input", side_effect=["", "https://test.invalid", "user"]), patch("getpass.getpass", return_value="synthetic-password"):
        try:
            vault.add_profile(root, "empty")
        except vault.VaultError:
            pass
        else:
            raise AssertionError("missing description accepted")
    assert vault.store_path_for(root).read_bytes() == before
`, VAULT, path.join(root, "profiles")], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: os.tmpdir(), PYTHONDONTWRITEBYTECODE: "1" }
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout + result.stderr, "");
    });
  });

  await test("upsert-env and interactive commands reject malformed or absent input before storage mutation", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      const missing = runVault(vaultDir, ["upsert-env", "missing"], {
        ENV_PROFILE_ADDRESS: VALUES.address,
        ENV_PROFILE_USERNAME: VALUES.username
      });
      assert.notEqual(missing.status, 0);
      assert(!(`${missing.stdout}${missing.stderr}`).includes(VALUES.address));
      assert.equal(fs.existsSync(path.join(vaultDir, "profiles.json")), false);

      const malformed = runVault(vaultDir, ["upsert-env", "bad/name"], profileEnvironment());
      assert.notEqual(malformed.status, 0);
      assert.equal(fs.existsSync(path.join(vaultDir, "profiles.json")), false);

      const duplicateSource = runVault(
        vaultDir,
        ["upsert-env", "duplicate", "--address-env", "VALUE", "--username-env", "VALUE"],
        { VALUE: "synthetic", ENV_PROFILE_PASSWORD: VALUES.password }
      );
      assert.notEqual(duplicateSource.status, 0);
      assert.equal(fs.existsSync(path.join(vaultDir, "profiles.json")), false);

      const interactive = runVault(vaultDir, ["add", "staging"]);
      assert.notEqual(interactive.status, 0);
      assert.match(interactive.stderr, /interactive terminal/);
    });
  });

  await test("legacy GPG files are left alone and a malformed plaintext store fails safely", () => {
    withTempDir((root) => {
      const vaultDir = path.join(root, "profiles");
      fs.mkdirSync(path.join(vaultDir, "profiles"), { recursive: true });
      const legacyConfig = path.join(vaultDir, "config.json");
      const legacyProfile = path.join(vaultDir, "profiles", "legacy.json.gpg");
      fs.writeFileSync(legacyConfig, "legacy-config", "utf8");
      fs.writeFileSync(legacyProfile, "legacy-profile", "utf8");
      assert.equal(runVault(vaultDir, ["init"]).status, 0);
      assert.equal(fs.readFileSync(legacyConfig, "utf8"), "legacy-config");
      assert.equal(fs.readFileSync(legacyProfile, "utf8"), "legacy-profile");

      fs.writeFileSync(path.join(vaultDir, "profiles.json"), "not-json", "utf8");
      const malformed = runVault(vaultDir, ["list"]);
      assert.notEqual(malformed.status, 0);
      assert.match(malformed.stderr, /plaintext profile store is unreadable/);
      assert(!malformed.stderr.includes("Traceback"));
    });
  });
}

function runVault(vaultDir, args, extraEnvironment = {}) {
  return spawnSync("python3", [VAULT, "--vault-dir", vaultDir, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: os.tmpdir(), ...extraEnvironment }
  });
}

function profileEnvironment() {
  return {
    ENV_PROFILE_ADDRESS: VALUES.address,
    ENV_PROFILE_USERNAME: VALUES.username,
    ENV_PROFILE_PASSWORD: VALUES.password,
    ENV_PROFILE_DESCRIPTION: DESCRIPTION
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mode(filePath) {
  return fs.statSync(filePath).mode & 0o777;
}

function withTempDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "environment-profile-vault-test-"));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
