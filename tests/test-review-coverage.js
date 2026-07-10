import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeReviewPacketDigest } from "../skills/review/review-packet-gate/scripts/review-packet-digest.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(
  packageRoot,
  "skills",
  "review",
  "review-packet-gate",
  "scripts",
  "review-packet-digest.mjs"
);

function command(args, cwd) {
  return spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
}

function git(root, ...args) {
  const result = command(["git", ...args], root);
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function runHelper(args) {
  assert.equal(fs.existsSync(helperPath), true, "review coverage helper is missing");
  const execution = executeReviewPacketDigest(args);
  return { result: { status: execution.exitCode }, json: execution.body };
}

function expectOk(args) {
  const { result, json } = runHelper(args);
  assert.equal(result.status, 0, `${json.error_code ?? "unknown"}: ${json.message ?? result.stderr}`);
  assert.equal(json.status, "ok");
  return json;
}

function expectError(args, code) {
  const { result, json } = runHelper(args);
  assert.notEqual(result.status, 0, `expected ${code} failure`);
  assert.equal(json.status, "error");
  assert.equal(json.error_code, code);
}

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function withTemp(prefix, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createRepo(root) {
  git(root, "init", "-q");
  git(root, "config", "user.email", "review-coverage@example.test");
  git(root, "config", "user.name", "Review Coverage");
  write(root, ".gitignore", "generated/\n");
  write(root, "tracked.txt", "base\n");
  git(root, "add", "-f", ".gitignore", "tracked.txt");
  git(root, "commit", "-qm", "base");
}

function targetArgs(root, declaration, extra = []) {
  return [
    "target",
    "--kind",
    "git-worktree",
    "--code-root",
    root,
    "--base",
    "HEAD",
    "--declaration",
    declaration,
    ...extra,
    "--json"
  ];
}

function assertDigest(value) {
  assert.match(value, /^sha256:[a-f0-9]{64}$/);
}

export async function run(test) {
  await test("review coverage helper exists", () => {
    assert.equal(fs.existsSync(helperPath), true, "review coverage helper is missing");
  });

  await test("git target fingerprints staged, unstaged, scoped, and ignored inputs without local roots", () => {
    withTemp("harness-review-coverage-git-", (root) => {
      createRepo(root);
      const declaration = write(
        root,
        "declaration.txt",
        "untracked-scope: scope\r\ninclude: generated/report.txt | generated | reviewed output\r\n"
      );
      write(root, "tracked.txt", "staged\n");
      git(root, "add", "tracked.txt");
      write(root, "tracked.txt", "unstaged after stage\n");
      write(root, "scope/a.txt", "scoped\n");
      write(root, "outside.txt", "outside\n");
      write(root, "generated/report.txt", "generated\n");

      const args = targetArgs(root, declaration, [
        "--untracked-scope",
        "scope",
        "--include-path",
        "generated/report.txt"
      ]);
      const first = expectOk(args);
      const second = expectOk(args);
      assert.equal(first.target_fingerprint, second.target_fingerprint);
      assert.equal(first.target_kind, "git-worktree");
      assert.equal(first.fingerprint_format, "review-target-v1");
      assert.equal(first.helper_version, 1);
      assert.equal(first.git_object_format, "sha1");
      assert.match(first.base_revision, /^[a-f0-9]{40}$/);
      assert.equal(first.base_revision, first.head_revision);
      assert.deepEqual(first.untracked_scopes, ["scope"]);
      assert.deepEqual(first.include_paths, ["generated/report.txt"]);
      assertDigest(first.target_fingerprint);
      assertDigest(first.declaration_digest);
      for (const component of ["committed", "staged", "unstaged", "untracked", "declared-inputs"]) {
        assertDigest(first.components[component].digest);
      }
      assert.doesNotMatch(JSON.stringify(first), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      const lfDeclaration = write(
        root,
        "declaration-lf.txt",
        "untracked-scope: scope\ninclude: generated/report.txt | generated | reviewed output\n"
      );
      assert.equal(
        expectOk(
          targetArgs(root, lfDeclaration, [
            "--untracked-scope",
            "scope",
            "--include-path",
            "generated/report.txt"
          ])
        ).declaration_digest,
        first.declaration_digest
      );
      assert.deepEqual(
        expectOk(
          targetArgs(root, declaration, [
            "--untracked-scope",
            "z-scope",
            "--untracked-scope",
            "scope",
            "--include-path",
            "generated/report.txt"
          ])
        ).untracked_scopes,
        ["scope", "z-scope"]
      );
      assert.deepEqual(expectOk(targetArgs(root, declaration)).untracked_scopes, ["."]);

      write(root, "outside.txt", "outside changed\n");
      assert.equal(expectOk(args).target_fingerprint, first.target_fingerprint);
      write(root, "scope/a.txt", "scoped changed\n");
      assert.notEqual(expectOk(args).target_fingerprint, first.target_fingerprint);

      expectError(
        targetArgs(root, declaration, ["--untracked-scope", "scope", "--untracked-scope", "scope"]),
        "TARGET_FINGERPRINT_UNAVAILABLE"
      );
      expectError(
        targetArgs(root, declaration, ["--untracked-scope", "../outside"]),
        "TARGET_FINGERPRINT_UNAVAILABLE"
      );
      expectError(
        targetArgs(root, declaration, ["--include-path", "tracked.txt"]),
        "TARGET_FINGERPRINT_UNAVAILABLE"
      );
      expectError(
        targetArgs(root, declaration, ["--untracked-scope", "scope", "--include-path", "scope/a.txt"]),
        "TARGET_FINGERPRINT_UNAVAILABLE"
      );
    });
  });

  await test("git target captures staged deletion and executable mode changes", () => {
    withTemp("harness-review-coverage-mode-", (root) => {
      createRepo(root);
      const declaration = write(root, "declaration.txt", "review: staged metadata\n");
      const baseline = expectOk(targetArgs(root, declaration));
      fs.unlinkSync(path.join(root, "tracked.txt"));
      git(root, "add", "-u");
      const deleted = expectOk(targetArgs(root, declaration));
      assert.notEqual(deleted.target_fingerprint, baseline.target_fingerprint);

      write(root, "tracked.txt", "replacement\n");
      fs.chmodSync(path.join(root, "tracked.txt"), 0o755);
      git(root, "add", "tracked.txt");
      const executable = expectOk(targetArgs(root, declaration));
      assert.notEqual(executable.target_fingerprint, deleted.target_fingerprint);
    });
  });

  await test("git target rejects an unmerged index and invalid declaration encoding", () => {
    withTemp("harness-review-coverage-conflict-", (root) => {
      createRepo(root);
      const declaration = write(root, "declaration.txt", "review: conflict\n");
      const branch = git(root, "branch", "--show-current");
      git(root, "checkout", "-qb", "topic");
      write(root, "tracked.txt", "topic\n");
      git(root, "add", "tracked.txt");
      git(root, "commit", "-qm", "topic");
      git(root, "checkout", "-q", branch);
      write(root, "tracked.txt", "base side\n");
      git(root, "add", "tracked.txt");
      git(root, "commit", "-qm", "base side");
      const merge = command(["git", "merge", "topic", "--no-edit"], root);
      assert.notEqual(merge.status, 0, merge.stdout + merge.stderr);
      expectError(targetArgs(root, declaration), "TARGET_FINGERPRINT_UNAVAILABLE");
    });

    withTemp("harness-review-coverage-bom-", (root) => {
      createRepo(root);
      const declaration = write(root, "declaration.txt", Buffer.from([0xef, 0xbb, 0xbf, 0x78]));
      expectError(targetArgs(root, declaration), "TARGET_FINGERPRINT_UNAVAILABLE");
    });
  });

  await test("artifact target covers explicit regular files and symlinks", () => {
    withTemp("harness-review-coverage-artifact-", (root) => {
      write(root, "artifact/a.txt", "one\n");
      write(root, "artifact/nested/b.txt", "two\n");
      try {
        fs.symlinkSync("a.txt", path.join(root, "artifact", "link.txt"));
      } catch (error) {
        if (process.platform !== "win32") {
          throw error;
        }
      }
      const declaration = write(root, "declaration.txt", "artifact: selected output\r\n\r\n");
      const args = [
        "target",
        "--kind",
        "artifact-set",
        "--artifact-root",
        path.join(root, "artifact"),
        "--include-path",
        ".",
        "--declaration",
        declaration,
        "--json"
      ];
      const first = expectOk(args);
      assert.equal(first.target_kind, "artifact-set");
      assert.equal(first.base_revision, "N/A");
      assert.equal(first.head_revision, "N/A");
      assert.deepEqual(first.untracked_scopes, []);
      assert.deepEqual(first.include_paths, ["."]);
      assertDigest(first.target_fingerprint);
      assert.doesNotMatch(JSON.stringify(first), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      write(root, "artifact/nested/b.txt", "changed\n");
      assert.notEqual(expectOk(args).target_fingerprint, first.target_fingerprint);
      expectError(
        ["target", "--kind", "artifact-set", "--artifact-root", path.join(root, "artifact"), "--declaration", declaration, "--json"],
        "TARGET_FINGERPRINT_UNAVAILABLE"
      );
    });
  });

  await test("packet sealing normalizes line endings and rejects malformed or stale seals", () => {
    withTemp("harness-review-coverage-packet-", (root) => {
      const packet = write(root, "expected.md", "# Expected Coverage Packet\r\nPacketDigest: sha256:self\r\n");
      const self = expectOk(["packet", "--input", packet, "--json"]);
      assertDigest(self.packet_digest);
      fs.writeFileSync(packet, `# Expected Coverage Packet\nPacketDigest: ${self.packet_digest}\n`);
      assert.equal(expectOk(["packet", "--input", packet, "--json"]).packet_digest, self.packet_digest);
      fs.writeFileSync(packet, "# Changed\nPacketDigest: sha256:0000000000000000000000000000000000000000000000000000000000000000\n");
      expectError(["packet", "--input", packet, "--json"], "PACKET_SEAL_MISMATCH");
      fs.writeFileSync(packet, "PacketDigest: sha256:self\nPacketDigest: sha256:self\n");
      expectError(["packet", "--input", packet, "--json"], "PACKET_SEAL_INVALID");
    });
  });
}
