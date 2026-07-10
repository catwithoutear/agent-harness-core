import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "../lib/change/markdown.js";
import { runHarnessProject } from "../lib/project/projector.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("subagent manifest descriptions match role frontmatter", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    for (const agent of manifest.assets.agents) {
      const rolePath = path.join(packageRoot, agent.source);
      assert.equal(fs.existsSync(rolePath), true, `${agent.id} source missing`);
      const meta = parseFrontMatter(rolePath);
      assert.equal(meta.name, agent.runtimeName, `${agent.id} runtime name drifted`);
      assert.equal(meta.description, agent.description, `${agent.id} description drifted`);
    }
  });

  await test("review verifier is read-only and isolated from reviewer findings during inventory", () => {
    const role = fs.readFileSync(path.join(packageRoot, "agents", "roles", "review-verifier.md"), "utf8");
    for (const required of ["Read only", "inventory", "compare", "no reviewer ledger", "overall_gate", "coverage_gate"]) {
      assert.match(role, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  await test("planning reviewer covers implementation design readiness without edit authority", () => {
    const role = fs.readFileSync(path.join(packageRoot, "agents", "roles", "planning-reviewer.md"), "utf8");
    assert.match(role, /## Review Principles/);
    assert.match(role, /every reviewed code change point, design\s+decision, and implementation approach/);
    assert.match(role, /smallest design/);
    assert.match(role, /Necessity:/);
    assert.match(role, /directly serve the current\s+requirement/);
    assert.match(role, /Reuse:/);
    assert.match(role, /helper, shared module, base class/);
    assert.match(role, /Repository patterns:/);
    assert.match(role, /error handling, logging, resource management/);
    assert.match(role, /Further simplification:/);
    assert.match(role, /reduce branches, state, abstraction layers/);
    assert.match(role, /unnecessary abstractions/);
    assert.match(role, /speculative\s+generality/);
    assert.match(role, /duplicate local\s+mechanisms/);
    assert.match(role, /under-designed/);
    assert.match(role, /proportionate to risk/);
    assert.match(role, /Do not only say "simplify" or\s+"reuse existing code/);
    assert.match(role, /why the current design is\s+necessary/);
    assert.match(role, /## Authority/);
    assert.match(role, /Read only/);
    assert.match(role, /Do not edit/);
    assert.match(role, /implementation-design/);
    assert.match(role, /source anchors/i);
    assert.match(role, /relative\/path:Symbol/);
    assert.match(role, /phase-appropriate evidence/);
    assert.match(role, /Document integrity/i);
    assert.match(role, /planned validation/i);
    assert.match(role, /scope alignment/i);
    assert.match(role, /consumer completeness/i);
    assert.match(role, /validation gaps/i);
    assert.match(role, /validation-gap/i);
    assert.match(role, /Return `BLOCK`, `APPROVE_WITH_NOTES`, or `APPROVE`/);
  });

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
      assert.match(codex, /scope-alignment/);
      assert.match(codex, /consumer-completeness/);
      assert.match(codex, /validation-gap/);
      assert.match(claude, /name: reviewer/);
      assert.match(claude, /# Reviewer/);
      assert.match(claude, /scope-alignment/);
      assert.match(claude, /consumer-completeness/);
      assert.match(claude, /validation-gap/);
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
      assert.match(hook.body, /state_root/);
      assert.match(hook.body, /code_root/);
      assert.match(hook.body, /harness-change-doc --state-root <state-root> --code-root <code-root> resolve/);
      assert.match(hook.body, /harness-change-validate --state-root <state-root> --change <change>/);
      assert.match(hook.body, /linked worktree/i);
      assert.match(hook.body, /--worktrees/);

      const activeGuardPath = path.join(target, ".codex", "hooks", "active-change-guard.json");
      assert.equal(fs.existsSync(activeGuardPath), true);
      const activeGuard = JSON.parse(fs.readFileSync(activeGuardPath, "utf8"));
      assert.match(activeGuard.body, /Git status is not an activation signal/);
      assert.match(activeGuard.body, /candidate workspaces/);
      assert.match(activeGuard.body, /state_root/);
      assert.match(activeGuard.body, /code_root/);
      assert.match(activeGuard.body, /execution-map/);
      assert.match(activeGuard.body, /Worktree.*local execution coordinate/);
      assert.doesNotMatch(activeGuard.body, /branch-local-state.*(?:supported|implemented)/i);
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
