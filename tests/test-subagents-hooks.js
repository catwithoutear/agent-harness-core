import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHarnessProject } from "../lib/project/projector.js";

export async function run(test) {
  await test("subagent projection renders client-native files", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex,claude",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const codex = fs.readFileSync(path.join(target, ".codex", "agents", "reviewer.toml"), "utf8");
      const claude = fs.readFileSync(path.join(target, ".claude", "agents", "reviewer.md"), "utf8");
      assert.match(codex, /name = "reviewer"/);
      assert.match(codex, /developer_instructions = '''/);
      assert.doesNotMatch(codex, /^prompt =/m);
      assert.match(codex, /# Reviewer/);
      assert.match(claude, /name: reviewer/);
      assert.match(claude, /# Reviewer/);
    });
  });

  await test("hook projection renders supported hooks and reports unsupported intents", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex,omp",
          "--content",
          "hooks",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert(payload.warnings.some((warning) => warning.includes("client omp does not support hook intent")));
      const hookPath = path.join(target, ".codex", "hooks", "session-bootstrap.json");
      assert.equal(fs.existsSync(hookPath), true);
      const hook = JSON.parse(fs.readFileSync(hookPath, "utf8"));
      assert.equal(hook.intent, "session-bootstrap");
      assert.equal(hook.client, "codex");
      assert.match(hook.body, /git status as candidates only/);
      assert.match(hook.body, /Active change:\s+unresolved/);
      assert.match(hook.body, /harness-change-validate --repo-root <repo> --change <change>/);

      const activeGuardPath = path.join(target, ".codex", "hooks", "active-change-guard.json");
      assert.equal(fs.existsSync(activeGuardPath), true);
      const activeGuard = JSON.parse(fs.readFileSync(activeGuardPath, "utf8"));
      assert.match(activeGuard.body, /Git status is not an activation signal/);
      assert.match(activeGuard.body, /candidate workspaces/);
    });
  });
}

function withTempTarget(fn) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "harness-subagents-hooks-"));
  try {
    fn(target);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function capture(fn) {
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    return { status: fn(), stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}
