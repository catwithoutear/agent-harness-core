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
        ENV_PROFILE_PASSWORD: VALUES.password
      });
      assert.equal(first.status, 0, first.stderr);
      assert.equal(first.stdout + first.stderr, "");
      assert.equal(mode(vaultDir), 0o700);
      assert.equal(mode(path.join(vaultDir, "profiles.json")), 0o600);
      assert.deepEqual(readJson(path.join(vaultDir, "profiles.json")), {
        schema_version: 1,
        profiles: { staging: VALUES }
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

      const list = runVault(vaultDir, ["list"]);
      assert.equal(list.status, 0, list.stderr);
      assert.equal(list.stdout, "staging\n");
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
          "console.log(required.address, required.username, required.password);\n" +
          "console.error(required.password);\n" +
          "process.exit(7);\n",
        "utf8"
      );
      const result = runVault(vaultDir, ["run", "staging", "--", process.execPath, child], {
        ENV_PROFILE_ADDRESS: "ambient-address",
        ENV_PROFILE_USERNAME: "ambient-user",
        ENV_PROFILE_PASSWORD: "ambient-password"
      });

      assert.equal(result.status, 7);
      const output = result.stdout + result.stderr;
      for (const value of Object.values(VALUES)) {
        assert(!output.includes(value), `redaction leaked ${value}`);
      }
      assert.match(output, /\[REDACTED\]/);
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
    ENV_PROFILE_PASSWORD: VALUES.password
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
